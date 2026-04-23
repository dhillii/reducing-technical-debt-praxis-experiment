/**
 * @fileoverview Tests for TokenStore class.
 * @author Brandon Mills
 */

"use strict";

const { assert } = require("chai");
const espree = require("espree");
const TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

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
const Program = AST;
const VariableDeclaration = Program.body[0];
const VariableDeclarator = VariableDeclaration.declarations[0];
const BinaryExpression = VariableDeclarator.init;
const CallExpression = Program.body[1].expression;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Asserts that the given tokens match the expected values.
 * @param {Token[]} tokens
 * @param {string[]} expected
 */
function check(tokens, expected) {
	assert.strictEqual(tokens.length, expected.length);
	for (let i = 0; i < tokens.length; ++i) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

/**
 * Runs a series of test cases for a given method.
 * @param {string} title
 * @param {Function} method
 * @param {Array} cases
 */
function runCases(title, method, cases) {
	describe(title, () => {
		for (const c of cases) {
			const { it: itTitle, args, expected } = c;
			it(itTitle, () => {
				const result = method(...args);
				if (Array.isArray(expected)) {
					check(result, expected);
				} else {
					assert.strictEqual(result, expected);
				}
			});
		}
	});
}

// -----------------------------------------------------------------------------
// Test Suite
// -----------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	// -------------------------------------------------------------------------
	// getTokens
	// -------------------------------------------------------------------------

	runCases("when calling getTokens", store.getTokens.bind(store), [
		{
			it: "should retrieve all tokens for root node",
			args: [Program],
			expected: [
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
			],
		},
		{
			it: "should retrieve all tokens for binary expression",
			args: [BinaryExpression],
			expected: ["a", "*", "b"],
		},
		{
			it: "should retrieve all tokens plus one before for binary expression",
			args: [BinaryExpression, 1],
			expected: ["=", "a", "*", "b"],
		},
		{
			it: "should retrieve all tokens plus one after for binary expression",
			args: [BinaryExpression, 0, 1],
			expected: ["a", "*", "b", "call"],
		},
		{
			it: "should retrieve all tokens plus two before and one after for binary expression",
			args: [BinaryExpression, 2, 1],
			expected: ["answer", "=", "a", "*", "b", "call"],
		},
		{
			it: "should retrieve all matched tokens for root node with filter",
			args: [Program, t => t.type === "Identifier"],
			expected: ["answer", "a", "b", "call"],
		},
		{
			it: "should retrieve all matched tokens for root node with filter object",
			args: [
				Program,
				{ filter: t => t.type === "Identifier" },
			],
			expected: ["answer", "a", "b", "call"],
		},
		{
			it: "should retrieve all tokens and comments in the node for root node with includeComments option",
			args: [Program, { includeComments: true }],
			expected: [
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
		},
		{
			it: "should retrieve matched tokens and comments in the node for root node with includeComments and filter options",
			args: [
				Program,
				{
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				},
			],
			expected: ["A", "B", "C", "D", "E", "Z"],
		},
		{
			it: "should retrieve all tokens and comments in the node for binary expression with includeComments option",
			args: [BinaryExpression, { includeComments: true }],
			expected: ["a", "D", "*", "b"],
		},
		{
			it: "should retrieve tokens and comments from Program with leading and trailing comments and whitespace",
			args: [
				(() => {
					const code = " /*A*/ bar /*Z*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { includeComments: true }];
				})(),
			],
			expected: ["A", "bar", "Z"],
		},
	]);

	// -------------------------------------------------------------------------
	// getTokensBefore
	// -------------------------------------------------------------------------

	runCases("when calling getTokensBefore", store.getTokensBefore.bind(store), [
		{
			it: "should retrieve zero tokens before a node",
			args: [BinaryExpression, 0],
			expected: [],
		},
		{
			it: "should retrieve one token before a node",
			args: [BinaryExpression, 1],
			expected: ["="],
		},
		{
			it: "should retrieve more than one token before a node",
			args: [BinaryExpression, 2],
			expected: ["answer", "="],
		},
		{
			it: "should retrieve all tokens before a node",
			args: [BinaryExpression, 9e9],
			expected: ["var", "answer", "="],
		},
		{
			it: "should retrieve more than one token before a node with count option",
			args: [BinaryExpression, { count: 2 }],
			expected: ["answer", "="],
		},
		{
			it: "should retrieve matched tokens before a node with count and filter options",
			args: [
				BinaryExpression,
				{ count: 1, filter: t => t.value !== "=" },
			],
			expected: ["answer"],
		},
		{
			it: "should retrieve all matched tokens before a node with filter option",
			args: [
				BinaryExpression,
				{ filter: t => t.value !== "answer" },
			],
			expected: ["var", "="],
		},
		{
			it: "should retrieve no tokens before the root node",
			args: [Program, { count: 1 }],
			expected: [],
		},
		{
			it: "should retrieve tokens and comments before a node with count and includeComments option",
			args: [
				BinaryExpression,
				{ count: 3, includeComments: true },
			],
			expected: ["B", "=", "C"],
		},
		{
			it: "should retrieve all tokens and comments before a node with includeComments option only",
			args: [
				BinaryExpression,
				{ includeComments: true },
			],
			expected: ["A", "var", "answer", "B", "=", "C"],
		},
		{
			it: "should retrieve all tokens and comments before a node with includeComments and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					filter: t => t.type.startsWith("Block"),
				},
			],
			expected: ["A", "B", "C"],
		},
		{
			it: "should retrieve no tokens before Program when it starts with whitespace",
			args: [
				(() => {
					const code = " bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: [],
		},
		{
			it: "should retrieve no tokens before Program when it starts with a comment",
			args: [
				(() => {
					const code = "/*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: [],
		},
		{
			it: "should retrieve no tokens before Program when it starts with whitespace and a comment",
			args: [
				(() => {
					const code = " /*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { count: 1, includeComments: true }];
				})(),
			],
			expected: [],
		},
	]);

	// -------------------------------------------------------------------------
	// getTokenBefore
	// -------------------------------------------------------------------------

	runCases("when calling getTokenBefore", store.getTokenBefore.bind(store), [
		{
			it: "should retrieve one token before a node",
			args: [BinaryExpression],
			expected: "=",
		},
		{
			it: "should skip a given number of tokens",
			args: [BinaryExpression, 1],
			expected: "answer",
		},
		{
			it: "should skip two tokens",
			args: [BinaryExpression, 2],
			expected: "var",
		},
		{
			it: "should skip a given number of tokens with skip option",
			args: [BinaryExpression, { skip: 1 }],
			expected: "answer",
		},
		{
			it: "should skip two tokens with skip option",
			args: [BinaryExpression, { skip: 2 }],
			expected: "var",
		},
		{
			it: "should retrieve matched token with filter option",
			args: [BinaryExpression, t => t.value !== "="],
			expected: "answer",
		},
		{
			it: "should retrieve matched token with skip and filter options",
			args: [
				BinaryExpression,
				{ skip: 1, filter: t => t.value !== "=" },
			],
			expected: "var",
		},
		{
			it: "should retrieve one token or comment before a node with includeComments option",
			args: [BinaryExpression, { includeComments: true }],
			expected: "C",
		},
		{
			it: "should retrieve one token or comment before a node with includeComments and skip options",
			args: [
				BinaryExpression,
				{ includeComments: true, skip: 1 },
			],
			expected: "=",
		},
		{
			it: "should retrieve one token or comment before a node with includeComments and skip and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type.startsWith("Block"),
				},
			],
			expected: "B",
		},
		{
			it: "should retrieve the previous node if the comment at the end of source code is specified.",
			args: [
				(() => {
					const code = "a + b /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.comments[0]];
				})(),
			],
			expected: "b",
		},
		{
			it: "should retrieve the previous comment if the first token is specified.",
			args: [
				(() => {
					const code = "/*comment*/ a + b";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.tokens[0], { includeComments: true }];
				})(),
			],
			expected: "comment",
		},
		{
			it: "should retrieve null if the first comment is specified.",
			args: [
				(() => {
					const code = "/*comment*/ a + b";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.comments[0], { includeComments: true }];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null before Program when it starts with whitespace",
			args: [
				(() => {
					const code = " bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null before Program when it starts with a comment",
			args: [
				(() => {
					const code = "/*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null before Program when it starts with whitespace and a comment",
			args: [
				(() => {
					const code = " /*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { includeComments: true }];
				})(),
			],
			expected: null,
		},
	]);

	// -------------------------------------------------------------------------
	// getTokensAfter
	// -------------------------------------------------------------------------

	runCases("when calling getTokensAfter", store.getTokensAfter.bind(store), [
		{
			it: "should retrieve zero tokens after a node",
			args: [VariableDeclarator.id, 0],
			expected: [],
		},
		{
			it: "should retrieve one token after a node",
			args: [VariableDeclarator.id, 1],
			expected: ["="],
		},
		{
			it: "should retrieve more than one token after a node",
			args: [VariableDeclarator.id, 2],
			expected: ["=", "a"],
		},
		{
			it: "should retrieve all tokens after a node",
			args: [VariableDeclarator.id, 9e9],
			expected: [
				"=",
				"a",
				"*",
				"b",
				"call",
				"(",
				")",
				";",
			],
		},
		{
			it: "should retrieve more than one token after a node with count option",
			args: [VariableDeclarator.id, { count: 2 }],
			expected: ["=", "a"],
		},
		{
			it: "should retrieve all matched tokens after a node with filter option",
			args: [
				VariableDeclarator.id,
				{ filter: t => t.type === "Identifier" },
			],
			expected: ["a", "b", "call"],
		},
		{
			it: "should retrieve matched tokens after a node with count and filter options",
			args: [
				VariableDeclarator.id,
				{ count: 2, filter: t => t.type === "Identifier" },
			],
			expected: ["a", "b"],
		},
		{
			it: "should retrieve all tokens and comments after a node with includeComments option",
			args: [
				VariableDeclarator.id,
				{ includeComments: true },
			],
			expected: [
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
		},
		{
			it: "should retrieve several tokens and comments after a node with includeComments and count options",
			args: [
				VariableDeclarator.id,
				{ includeComments: true, count: 3 },
			],
			expected: ["B", "=", "C"],
		},
		{
			it: "should retrieve matched tokens and comments after a node with includeComments and count and filter options",
			args: [
				VariableDeclarator.id,
				{
					includeComments: true,
					count: 3,
					filter: t => t.type.startsWith("Block"),
				},
			],
			expected: ["B", "C", "D"],
		},
		{
			it: "should retrieve no tokens after Program when it ends with whitespace",
			args: [
				(() => {
					const code = "bar ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: [],
		},
		{
			it: "should retrieve no tokens after Program when it ends with a comment",
			args: [
				(() => {
					const code = "bar /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: [],
		},
		{
			it: "should retrieve no tokens after Program when it ends with a comment and whitespace",
			args: [
				(() => {
					const code = "bar /*comment*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { count: 1, includeComments: true }];
				})(),
			],
			expected: [],
		},
	]);

	// -------------------------------------------------------------------------
	// getTokenAfter
	// -------------------------------------------------------------------------

	runCases("when calling getTokenAfter", store.getTokenAfter.bind(store), [
		{
			it: "should retrieve one token after a node",
			args: [VariableDeclarator.id],
			expected: "=",
		},
		{
			it: "should skip a given number of tokens",
			args: [VariableDeclarator.id, 1],
			expected: "a",
		},
		{
			it: "should skip two tokens",
			args: [VariableDeclarator.id, 2],
			expected: "*",
		},
		{
			it: "should skip a given number of tokens with skip option",
			args: [VariableDeclarator.id, { skip: 1 }],
			expected: "a",
		},
		{
			it: "should skip two tokens with skip option",
			args: [VariableDeclarator.id, { skip: 2 }],
			expected: "*",
		},
		{
			it: "should retrieve matched token with filter option",
			args: [
				VariableDeclarator.id,
				{ filter: t => t.type === "Identifier" },
			],
			expected: "a",
		},
		{
			it: "should retrieve matched token with filter and skip options",
			args: [
				VariableDeclarator.id,
				{ skip: 1, filter: t => t.type === "Identifier" },
			],
			expected: "b",
		},
		{
			it: "should retrieve one token or comment after a node with includeComments option",
			args: [
				VariableDeclarator.id,
				{ includeComments: true },
			],
			expected: "B",
		},
		{
			it: "should retrieve one token or comment after a node with includeComments and skip options",
			args: [
				VariableDeclarator.id,
				{ includeComments: true, skip: 2 },
			],
			expected: "C",
		},
		{
			it: "should retrieve one token or comment after a node with includeComments and skip and filter options",
			args: [
				VariableDeclarator.id,
				{
					includeComments: true,
					skip: 2,
					filter: t => t.type.startsWith("Block"),
				},
			],
			expected: "D",
		},
		{
			it: "should retrieve the next node if the comment at the first of source code is specified.",
			args: [
				(() => {
					const code = "/*comment*/ a + b";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.comments[0]];
				})(),
			],
			expected: "a",
		},
		{
			it: "should retrieve the next comment if the last token is specified.",
			args: [
				(() => {
					const code = "a + b /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.tokens[2], { includeComments: true }];
				})(),
			],
			expected: "comment",
		},
		{
			it: "should retrieve null if the last comment is specified.",
			args: [
				(() => {
					const code = "a + b /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast.comments[0], { includeComments: true }];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null after Program when it ends with whitespace",
			args: [
				(() => {
					const code = "bar ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null after Program when it ends with a comment",
			args: [
				(() => {
					const code = "bar /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve null after Program when it ends with a comment and whitespace",
			args: [
				(() => {
					const code = "bar /*comment*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { includeComments: true }];
				})(),
			],
			expected: null,
		},
	]);

	// -------------------------------------------------------------------------
	// getFirstTokens
	// -------------------------------------------------------------------------

	runCases("when calling getFirstTokens", store.getFirstTokens.bind(store), [
		{
			it: "should retrieve zero tokens from a node's token stream",
			args: [BinaryExpression, 0],
			expected: [],
		},
		{
			it: "should retrieve one token from a node's token stream",
			args: [BinaryExpression, 1],
			expected: ["a"],
		},
		{
			it: "should retrieve more than one token from a node's token stream",
			args: [BinaryExpression, 2],
			expected: ["a", "*"],
		},
		{
			it: "should retrieve all tokens from a node's token stream",
			args: [BinaryExpression, 9e9],
			expected: ["a", "*", "b"],
		},
		{
			it: "should retrieve more than one token from a node's token stream with count option",
			args: [BinaryExpression, { count: 2 }],
			expected: ["a", "*"],
		},
		{
			it: "should retrieve matched tokens from a node's token stream with filter option",
			args: [
				BinaryExpression,
				t => t.type === "Identifier",
			],
			expected: ["a", "b"],
		},
		{
			it: "should retrieve matched tokens from a node's token stream with filter and count options",
			args: [
				BinaryExpression,
				{ count: 1, filter: t => t.type === "Identifier" },
			],
			expected: ["a"],
		},
		{
			it: "should retrieve all tokens and comments from a node's token stream with includeComments option",
			args: [
				BinaryExpression,
				{ includeComments: true },
			],
			expected: ["a", "D", "*", "b"],
		},
		{
			it: "should retrieve several tokens and comments from a node's token stream with includeComments and count options",
			args: [
				BinaryExpression,
				{ includeComments: true, count: 3 },
			],
			expected: ["a", "D", "*"],
		},
		{
			it: "should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					count: 3,
					filter: t => t.value !== "a",
				},
			],
			expected: ["D", "*", "b"],
		},
		{
			it: "should retrieve the first token from Program when it starts with whitespace",
			args: [
				(() => {
					const code = " bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: ["bar"],
		},
		{
			it: "should retrieve the first token from Program when it starts with a comment",
			args: [
				(() => {
					const code = "/*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: ["bar"],
		},
		{
			it: "should retrieve the first token/comment from Program when it starts with whitespace and a comment",
			args: [
				(() => {
					const code = " /*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { count: 2, includeComments: true }];
				})(),
			],
			expected: ["comment", "bar"],
		},
	]);

	// -------------------------------------------------------------------------
	// getFirstToken
	// -------------------------------------------------------------------------

	runCases("when calling getFirstToken", store.getFirstToken.bind(store), [
		{
			it: "should retrieve the first token of a node's token stream",
			args: [BinaryExpression],
			expected: "a",
		},
		{
			it: "should skip a given number of tokens",
			args: [BinaryExpression, 1],
			expected: "*",
		},
		{
			it: "should skip two tokens",
			args: [BinaryExpression, 2],
			expected: "b",
		},
		{
			it: "should skip a given number of tokens with skip option",
			args: [BinaryExpression, { skip: 1 }],
			expected: "*",
		},
		{
			it: "should skip two tokens with skip option",
			args: [BinaryExpression, { skip: 2 }],
			expected: "b",
		},
		{
			it: "should retrieve matched token with filter option",
			args: [
				BinaryExpression,
				t => t.type === "Identifier",
			],
			expected: "a",
		},
		{
			it: "should retrieve matched token with filter and skip options",
			args: [
				BinaryExpression,
				{ skip: 1, filter: t => t.type === "Identifier" },
			],
			expected: "b",
		},
		{
			it: "should retrieve the first token or comment of a node's token stream with includeComments option",
			args: [
				BinaryExpression,
				{ includeComments: true },
			],
			expected: "a",
		},
		{
			it: "should retrieve the first matched token or comment of a node's token stream with includeComments and skip options",
			args: [
				BinaryExpression,
				{ includeComments: true, skip: 1 },
			],
			expected: "D",
		},
		{
			it: "should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.value !== "a",
				},
			],
			expected: "*",
		},
		{
			it: "should retrieve the first comment if the comment is at the last of nodes",
			args: [
				(() => {
					const code = "a + b\n/*comment*/ c + d";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [
						{
							range: [
								ast.comments[0].range[0],
								ast.tokens[5].range[1],
							],
						},
						{ includeComments: true },
					];
				})(),
			],
			expected: "comment",
		},
		{
			it: "should retrieve the first token (without includeComments option) if the comment is at the last of nodes",
			args: [
				(() => {
					const code = "a + b\n/*comment*/ c + d";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [
						{
							range: [
								ast.comments[0].range[0],
								ast.tokens[5].range[1],
							],
						},
					];
				})(),
			],
			expected: "c",
		},
		{
			it: "should retrieve the first token if the root node contains a trailing comment",
			args: [
				(() => {
					const parser = require("../../../../fixtures/parsers/all-comments-parser");
					const code = "foo // comment";
					const ast = parser.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: ast => ast.tokens[0],
		},
		{
			it: "should return null if the source contains only comments",
			args: [
				(() => {
					const code = "// comment";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { filter: () => assert.fail("Unexpected call to filter callback") }];
				})(),
			],
			expected: null,
		},
		{
			it: "should return null if the source is empty",
			args: [
				(() => {
					const code = "";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
		{
			it: "should retrieve the first token from Program when it starts with whitespace",
			args: [
				(() => {
					const code = " bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: "bar",
		},
		{
			it: "should retrieve the first token from Program when it starts with a comment",
			args: [
				(() => {
					const code = "/*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: "bar",
		},
		{
			it: "should retrieve the first token from Program when it starts with whitespace and a comment",
			args: [
				(() => {
					const code = " /*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { includeComments: true }];
				})(),
			],
			expected: "comment",
		},
	]);

	// -------------------------------------------------------------------------
	// getLastTokens
	// -------------------------------------------------------------------------

	runCases("when calling getLastTokens", store.getLastTokens.bind(store), [
		{
			it: "should retrieve zero tokens from the end of a node's token stream",
			args: [BinaryExpression, 0],
			expected: [],
		},
		{
			it: "should retrieve one token from the end of a node's token stream",
			args: [BinaryExpression, 1],
			expected: ["b"],
		},
		{
			it: "should retrieve more than one token from the end of a node's token stream",
			args: [BinaryExpression, 2],
			expected: ["*", "b"],
		},
		{
			it: "should retrieve all tokens from the end of a node's token stream",
			args: [BinaryExpression, 9e9],
			expected: ["a", "*", "b"],
		},
		{
			it: "should retrieve more than one token from the end of a node's token stream with count option",
			args: [BinaryExpression, { count: 2 }],
			expected: ["*", "b"],
		},
		{
			it: "should retrieve matched tokens from the end of a node's token stream with filter option",
			args: [
				BinaryExpression,
				t => t.type === "Identifier",
			],
			expected: ["a", "b"],
		},
		{
			it: "should retrieve matched tokens from the end of a node's token stream with filter and count options",
			args: [
				BinaryExpression,
				{ count: 1, filter: t => t.type === "Identifier" },
			],
			expected: ["b"],
		},
		{
			it: "should retrieve all tokens from the end of a node's token stream with includeComments option",
			args: [
				BinaryExpression,
				{ includeComments: true },
			],
			expected: ["a", "D", "*", "b"],
		},
		{
			it: "should retrieve matched tokens from the end of a node's token stream with includeComments and count options",
			args: [
				BinaryExpression,
				{ includeComments: true, count: 3 },
			],
			expected: ["D", "*", "b"],
		},
		{
			it: "should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					count: 3,
					filter: t => t.type !== "Punctuator",
				},
			],
			expected: ["a", "D", "b"],
		},
		{
			it: "should retrieve the last token from Program when it ends with whitespace",
			args: [
				(() => {
					const code = "bar ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: ["bar"],
		},
		{
			it: "should retrieve the last token from Program when it ends with a comment",
			args: [
				(() => {
					const code = "bar /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, 1];
				})(),
			],
			expected: ["bar"],
		},
		{
			it: "should retrieve the last token/comment from Program when it ends with a comment and whitespace",
			args: [
				(() => {
					const code = "bar /*comment*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { count: 2, includeComments: true }];
				})(),
			],
			expected: ["bar", "comment"],
		},
	]);

	// -------------------------------------------------------------------------
	// getLastToken
	// -------------------------------------------------------------------------

	runCases("when calling getLastToken", store.getLastToken.bind(store), [
		{
			it: "should retrieve the last token of a node's token stream",
			args: [BinaryExpression],
			expected: "b",
		},
		{
			it: "should retrieve the last token of a node's token stream (VariableDeclaration)",
			args: [VariableDeclaration],
			expected: "b",
		},
		{
			it: "should skip a given number of tokens",
			args: [BinaryExpression, 1],
			expected: "*",
		},
		{
			it: "should skip two tokens",
			args: [BinaryExpression, 2],
			expected: "a",
		},
		{
			it: "should skip a given number of tokens with skip option",
			args: [BinaryExpression, { skip: 1 }],
			expected: "*",
		},
		{
			it: "should skip two tokens with skip option",
			args: [BinaryExpression, { skip: 2 }],
			expected: "a",
		},
		{
			it: "should retrieve the last matched token of a node's token stream with filter option",
			args: [
				BinaryExpression,
				t => t.value !== "b",
			],
			expected: "*",
		},
		{
			it: "should retrieve the last matched token of a node's token stream with filter and skip options",
			args: [
				BinaryExpression,
				{ skip: 1, filter: t => t.type === "Identifier" },
			],
			expected: "a",
		},
		{
			it: "should retrieve the last token of a node's token stream with includeComments option",
			args: [
				BinaryExpression,
				{ includeComments: true },
			],
			expected: "b",
		},
		{
			it: "should retrieve the last token of a node's token stream with includeComments and skip options",
			args: [
				BinaryExpression,
				{ includeComments: true, skip: 2 },
			],
			expected: "D",
		},
		{
			it: "should retrieve the last token of a node's token stream with includeComments and skip and filter options",
			args: [
				BinaryExpression,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Identifier",
				},
			],
			expected: "D",
		},
		{
			it: "should retrieve the last comment if the comment is at the last of nodes",
			args: [
				(() => {
					const code = "a + b /*comment*/\nc + d";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [
						{
							range: [
								ast.tokens[0].range[0],
								ast.comments[0].range[1],
							],
						},
						{ includeComments: true },
					];
				})(),
			],
			expected: "comment",
		},
		{
			it: "should retrieve the last token (without includeComments option) if the comment is at the last of nodes",
			args: [
				(() => {
					const code = "a + b /*comment*/\nc + d";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [
						{
							range: [
								ast.tokens[0].range[0],
								ast.comments[0].range[1],
							],
						},
					];
				})(),
			],
			expected: "b",
		},
		{
			it: "should retrieve the last token if the root node contains a trailing comment",
			args: [
				(() => {
					const parser = require("../../../../fixtures/parsers/all-comments-parser");
					const code = "foo // comment";
					const ast = parser.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: ast => ast.tokens[0],
		},
		{
			it: "should retrieve the last token from Program when it ends with whitespace",
			args: [
				(() => {
					const code = "bar ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: "bar",
		},
		{
			it: "should retrieve the last token from Program when it ends with a comment",
			args: [
				(() => {
					const code = "bar /*comment*/";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: "bar",
		},
		{
			it: "should retrieve the last token from Program when it ends with a comment and whitespace",
			args: [
				(() => {
					const code = "bar /*comment*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { includeComments: true }];
				})(),
			],
			expected: "comment",
		},
		{
			it: "should return null if the source contains only comments",
			args: [
				(() => {
					const code = "// comment";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast, { filter: () => assert.fail("Unexpected call to filter callback") }];
				})(),
			],
			expected: null,
		},
		{
			it: "should return null if the source is empty",
			args: [
				(() => {
					const code = "";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return [ast];
				})(),
			],
			expected: null,
		},
	]);

	// -------------------------------------------------------------------------
	// getFirstTokensBetween
	// -------------------------------------------------------------------------

	runCases("when calling getFirstTokensBetween", store.getFirstTokensBetween.bind(store), [
		{
			it: "should retrieve zero tokens between adjacent nodes",
			args: [BinaryExpression, CallExpression],
			expected: [],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with count option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
			],
			expected: ["=", "a"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with count object",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ count: 2 },
			],
			expected: ["=", "a"],
		},
		{
			it: "should retrieve matched tokens between non-adjacent nodes with filter option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
			],
			expected: ["a"],
		},
		{
			it: "should retrieve all tokens between non-adjacent nodes with empty object option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
			],
			expected: ["=", "a", "*"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with includeComments option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			],
			expected: ["B", "=", "C", "a", "D", "*"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with includeComments and count options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
			],
			expected: ["B", "=", "C"],
		},
		{
			it: "should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
			],
			expected: ["B", "C", "a", "D"],
		},
	]);

	// -------------------------------------------------------------------------
	// getFirstTokenBetween
	// -------------------------------------------------------------------------

	runCases("when calling getFirstTokenBetween", store.getFirstTokenBetween.bind(store), [
		{
			it: "should return null between adjacent nodes",
			args: [BinaryExpression, CallExpression],
			expected: null,
		},
		{
			it: "should retrieve one token between non-adjacent nodes",
			args: [VariableDeclarator.id, BinaryExpression.right],
			expected: "=",
		},
		{
			it: "should retrieve one token between non-adjacent nodes with skip option",
			args: [VariableDeclarator.id, BinaryExpression.right, 1],
			expected: "a",
		},
		{
			it: "should retrieve one token between non-adjacent nodes with skip object",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 2 },
			],
			expected: "*",
		},
		{
			it: "should return null if it's skipped beyond the right token (skip 3)",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
			],
			expected: null,
		},
		{
			it: "should return null if it's skipped beyond the right token (skip 4)",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 4 },
			],
			expected: null,
		},
		{
			it: "should retrieve the first matched token between non-adjacent nodes with filter option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
			],
			expected: "=",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			],
			expected: "B",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
			],
			expected: "=",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
			],
			expected: "C",
		},
	]);

	// -------------------------------------------------------------------------
	// getLastTokensBetween
	// -------------------------------------------------------------------------

	runCases("when calling getLastTokensBetween", store.getLastTokensBetween.bind(store), [
		{
			it: "should retrieve zero tokens between adjacent nodes",
			args: [BinaryExpression, CallExpression],
			expected: [],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with count option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				2,
			],
			expected: ["a", "*"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with count object",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ count: 2 },
			],
			expected: ["a", "*"],
		},
		{
			it: "should retrieve matched tokens between non-adjacent nodes with filter option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Punctuator" },
			],
			expected: ["a"],
		},
		{
			it: "should retrieve all tokens between non-adjacent nodes with empty object option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{},
			],
			expected: ["=", "a", "*"],
		},
		{
			it: "should retrieve all tokens and comments between non-adjacent nodes with includeComments option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			],
			expected: ["B", "=", "C", "a", "D", "*"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes with includeComments and count options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, count: 3 },
			],
			expected: ["a", "D", "*"],
		},
		{
			it: "should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					filter: t => t.type !== "Punctuator",
				},
			],
			expected: ["B", "C", "a", "D"],
		},
	]);

	// -------------------------------------------------------------------------
	// getLastTokenBetween
	// -------------------------------------------------------------------------

	runCases("when calling getLastTokenBetween", store.getLastTokenBetween.bind(store), [
		{
			it: "should return null between adjacent nodes",
			args: [BinaryExpression, CallExpression],
			expected: null,
		},
		{
			it: "should retrieve one token between non-adjacent nodes",
			args: [VariableDeclarator.id, BinaryExpression.right],
			expected: "*",
		},
		{
			it: "should retrieve one token between non-adjacent nodes with skip option",
			args: [VariableDeclarator.id, BinaryExpression.right, 1],
			expected: "a",
		},
		{
			it: "should retrieve one token between non-adjacent nodes with skip object",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 2 },
			],
			expected: "=",
		},
		{
			it: "should return null if it's skipped beyond the right token (skip 3)",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 3 },
			],
			expected: null,
		},
		{
			it: "should return null if it's skipped beyond the right token (skip 4)",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ skip: 4 },
			],
			expected: null,
		},
		{
			it: "should retrieve the first matched token between non-adjacent nodes with filter option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ filter: t => t.type !== "Identifier" },
			],
			expected: "*",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments option",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true },
			],
			expected: "*",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{ includeComments: true, skip: 1 },
			],
			expected: "D",
		},
		{
			it: "should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options",
			args: [
				VariableDeclarator.id,
				BinaryExpression.right,
				{
					includeComments: true,
					skip: 1,
					filter: t => t.type !== "Punctuator",
				},
			],
			expected: "a",
		},
	]);

	// -------------------------------------------------------------------------
	// getTokensBetween
	// -------------------------------------------------------------------------

	runCases("when calling getTokensBetween", store.getTokensBetween.bind(store), [
		{
			it: "should retrieve zero tokens between adjacent nodes",
			args: [BinaryExpression, CallExpression],
			expected: [],
		},
		{
			it: "should retrieve one token between nodes",
			args: [BinaryExpression.left, BinaryExpression.right],
			expected: ["*"],
		},
		{
			it: "should retrieve multiple tokens between non-adjacent nodes",
			args: [VariableDeclarator.id, BinaryExpression.right],
			expected: ["=", "a", "*"],
		},
		{
			it: "should retrieve surrounding tokens when asked for padding",
			args: [VariableDeclarator.id, BinaryExpression.left, 2],
			expected: ["var", "answer", "=", "a", "*"],
		},
	]);

	// -------------------------------------------------------------------------
	// getTokenByRangeStart
	// -------------------------------------------------------------------------

	runCases("when calling getTokenByRangeStart", store.getTokenByRangeStart.bind(store), [
		{
			it: "should return identifier token",
			args: [9],
			expected: token => {
				assert.strictEqual(token.type, "Identifier");
				assert.strictEqual(token.value, "answer");
			},
		},
		{
			it: "should return null when token doesn't exist",
			args: [10],
			expected: null,
		},
		{
			it: "should return a comment token when includeComments is true",
			args: [15, { includeComments: true }],
			expected: token => {
				assert.strictEqual(token.type, "Block");
				assert.strictEqual(token.value, "B");
			},
		},
		{
			it: "should not return a comment token at the supplied index when includeComments is false",
			args: [15, { includeComments: false }],
			expected: null,
		},
		{
			it: "should not return comment tokens by default",
			args: [15],
			expected: null,
		},
	]);

	// -------------------------------------------------------------------------
	// getFirstToken & getTokenAfter (iteration example)
	// -------------------------------------------------------------------------

	it("should retrieve all tokens and comments in the node (iteration)", () => {
		const code = "(function(a, /*b,*/ c){})";
		const ast = espree.parse(code, DEFAULT_CONFIG);
		const tokenStore = new TokenStore(ast.tokens, ast.comments);
		const tokens = [];
		let token = tokenStore.getFirstToken(ast);
		while (token) {
			tokens.push(token);
			token = tokenStore.getTokenAfter(token, { includeComments: true });
		}
		check(tokens, [
			"(",
			"function",
			"(",
			"a",
			",",
			"b,",
			"c",
			")",
			"{",
			"}",
			")",
		]);
	});

	it("should retrieve all tokens and comments in the node (no spaces)", () => {
		const code = "(function(a,/*b,*/c){})";
		const ast = espree.parse(code, DEFAULT_CONFIG);
		const tokenStore = new TokenStore(ast.tokens, ast.comments);
		const tokens = [];
		let token = tokenStore.getFirstToken(ast);
		while (token) {
			tokens.push(token);
			token = tokenStore.getTokenAfter(token, { includeComments: true });
		}
		check(tokens, [
			"(",
			"function",
			"(",
			"a",
			",",
			"b,",
			"c",
			")",
			"{",
			"}",
			")",
		]);
	});

	// -------------------------------------------------------------------------
	// getLastToken & getTokenBefore (iteration example)
	// -------------------------------------------------------------------------

	it("should retrieve all tokens and comments in the node (reverse iteration)", () => {
		const code = "(function(a, /*b,*/ c){})";
		const ast = espree.parse(code, DEFAULT_CONFIG);
		const tokenStore = new TokenStore(ast.tokens, ast.comments);
		const tokens = [];
		let token = tokenStore.getLastToken(ast);
		while (token) {
			tokens.push(token);
			token = tokenStore.getTokenBefore(token, { includeComments: true });
		}
		check(tokens.reverse(), [
			"(",
			"function",
			"(",
			"a",
			",",
			"b,",
			"c",
			")",
			"{",
			"}",
			")",
		]);
	});

	it("should retrieve all tokens and comments in the node (no spaces, reverse)", () => {
		const code = "(function(a,/*b,*/c){})";
		const ast = espree.parse(code, DEFAULT_CONFIG);
		const tokenStore = new TokenStore(ast.tokens, ast.comments);
		const tokens = [];
		let token = tokenStore.getLastToken(ast);
		while (token) {
			tokens.push(token);
			token = tokenStore.getTokenBefore(token, { includeComments: true });
		}
		check(tokens.reverse(), [
			"(",
			"function",
			"(",
			"a",
			",",
			"b,",
			"c",
			")",
			"{",
			"}",
			")",
		]);
	});

	// -------------------------------------------------------------------------
	// commentsExistBetween
	// -------------------------------------------------------------------------

	it("should retrieve false if comments don't exist", () => {
		assert.isFalse(store.commentsExistBetween(AST.tokens[0], AST.tokens[1]));
	});

	it("should retrieve true if comments exist", () => {
		assert.isTrue(store.commentsExistBetween(AST.tokens[1], AST.tokens[2]));
	});

	// -------------------------------------------------------------------------
	// getCommentsBefore
	// -------------------------------------------------------------------------

	runCases("getCommentsBefore", store.getCommentsBefore.bind(store), [
		{
			it: "should retrieve comments before a node",
			args: [VariableDeclaration],
			expected: ["A"],
		},
		{
			it: "should retrieve comments before a token",
			args: [TOKENS[2]],
			expected: ["B"],
		},
		{
			it: "should retrieve multiple comments before a node",
			args: [CallExpression],
			expected: ["E", "F"],
		},
		{
			it: "should return an empty array for a Program node",
			args: [Program],
			expected: [],
		},
		{
			it: "should return an empty array if there are no comments before a node or token",
			args: [BinaryExpression.right],
			expected: [],
		},
		{
			it: "should return an empty array if there are no comments before a token",
			args: [TOKENS[1]],
			expected: [],
		},
		{
			it: "should retrieve no comments before Program when it starts with whitespace and a comment",
			args: [
				(() => {
					const code = " /*comment*/ bar";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return ast;
				})(),
			],
			expected: [],
		},
	]);

	// -------------------------------------------------------------------------
	// getCommentsAfter
	// -------------------------------------------------------------------------

	runCases("getCommentsAfter", store.getCommentsAfter.bind(store), [
		{
			it: "should retrieve comments after a node",
			args: [VariableDeclarator.id],
			expected: ["B"],
		},
		{
			it: "should retrieve comments after a token",
			args: [TOKENS[2]],
			expected: ["C"],
		},
		{
			it: "should retrieve multiple comments after a node",
			args: [VariableDeclaration],
			expected: ["E", "F"],
		},
		{
			it: "should return an empty array for a Program node",
			args: [Program],
			expected: [],
		},
		{
			it: "should return an empty array if there are no comments after a node or token",
			args: [CallExpression.callee],
			expected: [],
		},
		{
			it: "should return an empty array if there are no comments after a token",
			args: [TOKENS[0]],
			expected: [],
		},
		{
			it: "should retrieve no comments after Program when it ends with a comment and whitespace",
			args: [
				(() => {
					const code = "bar /*comment*/ ";
					const ast = espree.parse(code, DEFAULT_CONFIG);
					const tokenStore = new TokenStore(ast.tokens, ast.comments);
					return ast;
				})(),
			],
			expected: [],
		},
	]);

	// -------------------------------------------------------------------------
	// getCommentsInside
	// -------------------------------------------------------------------------

	runCases("getCommentsInside", store.getCommentsInside.bind(store), [
		{
			it: "should retrieve comments inside a node",
			args: [Program],
			expected: ["A", "B", "C", "D", "E", "F", "Z"],
		},
		{
			it: "should retrieve comments inside VariableDeclaration",
			args: [VariableDeclaration],
			expected: ["B", "C", "D"],
		},
		{
			it: "should retrieve comments inside VariableDeclarator",
			args: [VariableDeclarator],
			expected: ["B", "C", "D"],
		},
		{
			it: "should retrieve comments inside BinaryExpression",
			args: [BinaryExpression],
			expected: ["D"],
		},
		{
			it: "should return an empty array if a node does not contain any comments",
			args: [TOKENS[2]],
			expected: [],
		},
	]);
});