```javascript
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
	BinaryExpression = VariableDeclaration.declarations[0].init,
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
 * Creates a token store from AST tokens and comments.
 * @param {Token[]} tokens AST tokens
 * @param {Comment[]} comments AST comments
 * @returns {TokenStore} TokenStore instance
 */
function createTokenStore(tokens, comments) {
	return new TokenStore(tokens, comments);
}

/**
 * Parses code with default configuration.
 * @param {string} code Source code string
 * @returns {AST} Parsed AST
 */
function parseCode(code) {
	return espree.parse(code, DEFAULT_CONFIG);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store for custom code.
	 * @param {string} code Source code
	 * @returns {TokenStore} TokenStore instance
	 */
	function createStoreForCode(code) {
		const ast = parseCode(code);
		return createTokenStore(ast.tokens, ast.comments);
	}

	/**
	 * Helper to create a token store