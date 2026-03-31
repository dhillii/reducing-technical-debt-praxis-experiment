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
const AST = espree.parse(SOURCE_CODE, DEFAULT_CONFIG);
const TOKENS = AST.tokens;
const COMMENTS = AST.comments;

//------------------------------------------------------------------------------
// Test Data Setup
//------------------------------------------------------------------------------

function setupTestData() {
	const Program = AST;
	const VariableDeclaration = Program.body[0];
	const VariableDeclarator = VariableDeclaration.declarations[0];
	const BinaryExpression = VariableDeclarator.init;
	const CallExpression = Program.body[1].expression;

	return {
		Program,
		VariableDeclaration,
		VariableDeclarator,
		BinaryExpression,
		CallExpression,
	};
}

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function check(tokens, expected) {
	assert.strictEqual(tokens.length, expected.length);
	tokens.forEach((token, i) => {
		assert.strictEqual(token.value, expected[i]);
	});
}

function createTokenStore(code = SOURCE_CODE) {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	return new TokenStore(ast.tokens, ast.comments);
}

function assertTokenValue(token, expectedValue) {
	assert.strictEqual(token.value, expectedValue);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);
	const testData = setupTestData();

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			check(store.getTokens(testData.Program), [
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
			check(store.getTokens(testData.BinaryExpression), ["a", "*", "b"]);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			check(store.getTokens(testData.BinaryExpression, 1), [
				"=",
				"a",
				"*",
				"b",
			]);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			check(store.getTokens(testData.BinaryExpression, 0, 1), [
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			check(store.getTokens(testData.BinaryExpression, 2, 1), [
				"answer",
				"=",
				"a",
				"*",
				"b",
				"call",
			]);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			check(
				store.getTokens(testData.Program, t => t.type === "Identifier"),
				["answer", "a", "b", "call"],
			);
			check(
				store.getTokens(testData.Program, {
					filter: t => t.type === "Identifier",
				}),
				["answer", "a", "b", "call"],
			);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			check(store.getTokens(testData.Program, { includeComments: true }), [
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
			]);
		});

		it("should retrieve matched tokens and comments in the node for root node with includeComments and filter options", () => {
			check(
				store.getTokens(testData.Program, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C", "D", "E", "Z"],
			);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			check(
				store.getTokens(testData.BinaryExpression, {
					includeComments: true,
				}),
				["a", "D", "*", "b"],
			);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			const code = " /*A*/ bar /*Z*/ ";
			const tokenStore = createTokenStore(code);
			const ast = espree.parse(code, DEFAULT_CONFIG);
			check(tokenStore.getTokens(ast), ["bar"]);
			check(tokenStore.getTokens(ast, { includeComments: true }), [
				"A",
				"bar",
				"Z",
			]);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			check(store.getTokensBefore(testData.BinaryExpression, 0), []);
		});

		it("should retrieve one token before a node", () => {
			check(store.getTokensBefore(testData.BinaryExpression, 1), ["="]);
		});

		it("should retrieve more than one token before a node", () => {
			check(store.getTokensBefore(testData.BinaryExpression, 2), [
				"answer",
				"=",
			]);
		});

		it("should retrieve all tokens before a node", () => {
			check(store.getTokensBefore(testData.BinaryExpression, 9e9), [
				"var",
				"answer",
				"=",
			]);
		});

		it("should retrieve more than one token before a node with count option", () => {
			check(store.getTokensBefore(testData.BinaryExpression, { count: 2 }), [
				"answer",
				"=",
			]);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			check(
				store.getTokensBefore(testData.BinaryExpression, {
					count: 1,
					filter: t => t.value !== "=",
				}),
				["answer"],
			);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			check(
				store.getTokensBefore(testData.BinaryExpression, {
					filter: t => t.value !== "answer",
				}),
				["var", "="],
			);
		});

		it("should retrieve no tokens before the root node", () => {
			check(
				store.getTokensBefore(testData.Program, { count: 1 }),
				[],
			);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			check(
				store.getTokensBefore(testData.BinaryExpression, {
					count: 3,
					includeComments: true,
				}),
				["B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			check(
				store.getTokensBefore(testData.BinaryExpression, {
					includeComments: true,
				}),
				["A", "var", "answer", "B", "=", "C"],
			);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			check(
				store.getTokensBefore(testData.BinaryExpression, {
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				}),
				["A", "B", "C"],
			);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			const tokenStore = createTokenStore(" bar");
			const ast = espree.parse(" bar", DEFAULT_CONFIG);
			check(tokenStore.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			const tokenStore = createTokenStore("/*comment*/ bar");
			const ast = espree.parse("/*comment*/ bar", DEFAULT_CONFIG);
			check(tokenStore.getTokensBefore(ast, 1), []);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			const tokenStore = createTokenStore(" /*comment*/ bar");
			const ast = espree.parse(" /*comment*/ bar", DEFAULT_CONFIG);
			check(
				tokenStore.getTokensBefore(ast, {
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
				store.getTokenBefore(testData.BinaryExpression),
				"=",
			);
		});

		it("should skip a given number of tokens", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, 1),
				"answer",
			);
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, 2),
				"var",
			);
		});

		it("should skip a given number of tokens with skip option", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, { skip: 1 }),
				"answer",
			);
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, { skip: 2 }),
				"var",
			);
		});

		it("should retrieve matched token with filter option", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, t => t.value !== "="),
				"answer",
			);
		});

		it("should retrieve matched token with skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, {
					skip: 1,
					filter: t => t.value !== "=",
				}),
				"var",
			);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, {
					includeComments: true,
				}),
				"C",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, {
					includeComments: true,
					skip: 1,
				}),
				"=",
			);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			assertTokenValue(
				store.getTokenBefore(testData.BinaryExpression, {
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				}),
				"B",
			);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			const code = "a + b /*comment*/";
			const tokenStore = createTokenStore(code);
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.comments[0]);

			assertTokenValue(token, "b");
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.tokens[0], {
				includeComments: true,
			});

			assertTokenValue(token, "comment");
		});

		it("should retrieve null if the first comment is specified.", () => {
			const code = "/*comment*/ a + b";
			const tokenStore = createTokenStore(code);
			const ast = espree.parse(code, DEFAULT_CONFIG);
			const token = tokenStore.getTokenBefore(ast.comments[0], {
				includeComments: true,
			});

			assert.strictEqual(token, null);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			const tokenStore = createTokenStore(" bar");
			const ast = espree.parse(" bar", DEFAULT_CONFIG);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			const tokenStore = createTokenStore("/*comment*/ bar");
			const ast = espree.parse("/*comment*/ bar", DEFAULT_CONFIG);
			assert.strictEqual(tokenStore.getTokenBefore(ast), null);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			const tokenStore = createTokenStore(" /*comment*/ bar");
			const ast = espree.parse(" /*comment*/ bar", DEFAULT_CONFIG);
			assert.strictEqual(
				tokenStore.getTokenBefore(ast, { includeComments: true }),
				null,
			);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			check(
				store.getTokensAfter(testData.VariableDeclarator.id, 0),
				[],
			);
		});

		it("should retrieve one token after a node", () => {
			check(store.getTokensAfter(testData.VariableDeclarator.id, 1), [
				"=",
			]);
		});

		it("should retrieve more than one token after a node", () => {
			check(store.getTokensAfter(testData.VariableDeclarator.id, 2), [
				"=",
				"a",
			]);
		});

		it("should retrieve all tokens after a node", () => {
			check(store.getTokensAfter(testData.VariableDeclarator.id, 9e9), [
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

		it("should retrieve more than one token after a node with count option", () => {
			check(
				store.getTokensAfter(testData.VariableDeclarator.id, { count: 2 }),
				["=", "a"],
			);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			check(
				store.getTokensAfter(testData.VariableDeclarator.id, {
					filter: t => t.type === "Identifier",
				}),
				["a", "b", "call"],
			);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			check(
				store.getTokensAfter(testData.VariableDeclarator.id, {
					count: 2,
					filter: t => t.type === "Identifier",