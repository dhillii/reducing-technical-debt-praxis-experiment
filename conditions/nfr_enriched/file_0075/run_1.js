```javascript
"use strict";

const assert = require("chai").assert;
const espree = require("espree");
const TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

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
	"/*A*/var answer/*B*/=/*C*/a/*D*/* b/*E*///F\n    call();\n/*Z*/";

//------------------------------------------------------------------------------
// Test Fixtures
//------------------------------------------------------------------------------

class TestFixture {
	constructor(sourceCode) {
		this.ast = espree.parse(sourceCode, DEFAULT_CONFIG);
		this.tokens = this.ast.tokens;
		this.comments = this.ast.comments;
		this.program = this.ast;
		this.variableDeclaration = this.program.body[0];
		this.variableDeclarator = this.variableDeclaration.declarations[0];
		this.binaryExpression = this.variableDeclarator.init;
		this.callExpression = this.program.body[1].expression;
	}
}

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks the values of tokens against an array of expected values.
 * @param {Token[]} tokens Tokens returned from the API.
 * @param {string[]} expected Expected token values
 * @returns {void}
 */
function checkTokenValues(tokens, expected) {
	assert.strictEqual(tokens.length, expected.length);
	tokens.forEach((token, index) => {
		assert.strictEqual(token.value, expected[index]);
	});
}

/**
 * Creates a new TokenStore from source code
 * @param {string} code Source code to parse
 * @returns {TokenStore} Token store instance
 */
function createTokenStore(code) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return new TokenStore(ast.tokens, ast.comments);
}

/**
 * Asserts token value equality
 * @param {Token} token Token to check
 * @param {string} expectedValue Expected token value
 * @returns {void}
 */
function assertTokenValue(token, expectedValue) {
	assert.strictEqual(token.value, expectedValue);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const fixture = new TestFixture(SOURCE_CODE);
	const store = new TokenStore(fixture.tokens, fixture.comments);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			checkTokenValues(store.getTokens(fixture.program), [
				"var",
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
				"(",
				")",
				";",
			]);
		});

		it("should retrieve all tokens for binary expression", () => {
			checkTokenValues(store.getTokens(fixture.binaryExpression), [
				"a",
				"*",
				"b",
			]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			checkTokenValues(
				store.getTokens(fixture.binaryExpression, 1),
				["=", "a", "*", "b"],
			);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			checkTokenValues(
				store.getTokens(fixture.binaryExpression, 0, 1),
				["a", "*", "b", "call"],
			);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			checkTokenValues(
				store.getTokens(fixture.binaryExpression, 2, 1),
				["answer", "=", "a", "*", "b", "call"],
			);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			checkTokenValues(
				store.getTokens(fixture.program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			checkTokenValues(
				store.getTokens(fixture.program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			checkTokenValues(
				store.getTokens(fixture.program, { includeComments: true }),
				[
					"A",
					"var",
					"answer",
					"B",
					"=",
					"C",
					"a",
					"D",
					"*",
					"b",
					"E",
					"F",
					"call",
					"(",
					")",
					";",
					"Z",
				],
			);
		});

		it("should retrieve matched tokens and comments in the node for root node with includeComments and filter options", () => {
			checkTokenValues(
				store.getTokens(fixture.program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			checkTokenValues(
				store.getTokens(fixture.binaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const code = " /*A*/ bar /*Z*/ ";
			const tokenStore = createTokenStore(code);
			checkTokenValues(tokenStore.getTokens(tokenStore.ast), ["bar"]);
			checkTokenValues(
				tokenStore.getTokens(tokenStore.ast, { includeComments: true }),
				["A", "bar", "Z"],
			);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, 0),
				[],
			);
		});

		it("should retrieve one token before a node", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, 1),
				["="],
			);
		});

		it("should retrieve more than one token before a node", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, 2),
				["answer", "="],
			);
		});

		it("should retrieve all tokens before a node", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, 9e9),
				["var", "answer", "="],
			);
		});

		it("should retrieve more than one token before a node with count option", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, { count: 2 }),
				["answer", "="],
			);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.program, { count: 1 }),
				[],
			);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			checkTokenValues(
				store.getTokensBefore(fixture.binaryExpression, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const tokenStore = createTokenStore(" bar");
			checkTokenValues(tokenStore.getTokensBefore(tokenStore.ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const tokenStore = createTokenStore("/*comment*/ bar");
			checkTokenValues(tokenStore.getTokensBefore(tokenStore.ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const tokenStore = createTokenStore(" /*comment*/ bar");
			checkTokenValues(
				tokenStore.getTokensBefore(tokenStore.ast, {
					count: 1,
					includeComments: true,
				}),
				[],
			);
		});
	});

	describe("when calling getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression),
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, 1),
				"answer",
			);
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, 2),
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, { skip: 1 }),
				"answer",
			);
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, { skip: 2 }),
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assertTokenValue(
				store.getTokenBefore(
					fixture.binaryExpression,
					t => t.value !== "=",
				),
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}),
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
				}),
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
					skip: 1,
				}),
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(fixture.binaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}),
				"B",
			);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			const tokenStore = createTokenStore("a + b /*comment*/");
			const token = tokenStore.getTokenBefore(tokenStore.ast.comments[0]);
			assertTokenValue(token, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const tokenStore = createTokenStore("/*comment*/ a + b");
			const token = tokenStore.getTokenBefore(tokenStore.ast.tokens[0], {
				includeComments: true,
			});
			assertTokenValue(token, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const tokenStore = createTokenStore("/*comment*/ a + b");
			const token = tokenStore.getTokenBefore(tokenStore.ast.comments[0], {
				includeComments: true,
			});
			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const tokenStore = createTokenStore(" bar");
			assert.strictEqual(tokenStore.getTokenBefore(tokenStore.ast), null);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const tokenStore = createTokenStore("/*comment*/ bar");
			assert.strictEqual(tokenStore.getTokenBefore(tokenStore.ast), null);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const tokenStore = createTokenStore(" /*comment*/ bar");
			assert.strictEqual(
				tokenStore.getTokenBefore(tokenStore.ast, {
					includeComments: true,
				}),
				null,
			);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, 0),
				[],
			);
		});

		it("should retrieve one token after a node", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, 1),
				["="],
			);
		});

		it("should retrieve more than one token after a node", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, 2),
				["=", "a"],
			);
		});

		it("should retrieve all tokens after a node", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, 9e9),
				["=", "a", "*", "b", "call", "(", ")", ";"],
			);
		});

		it("should retrieve more than one token after a node with count option", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, {
					count: 2,
				}),
				["=", "a"],
			);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			checkTokenValues(
				store.getTokensAfter(fixture.variableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",
				}),
				["a", "b