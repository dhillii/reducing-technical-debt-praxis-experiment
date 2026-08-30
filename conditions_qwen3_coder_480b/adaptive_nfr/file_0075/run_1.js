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
 * Test retrieval of all tokens for root node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensRootNode(store) {
	check(store.getTokens(Program), [
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
}

/**
 * Test retrieval of all tokens for binary expression.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBinaryExpression(store) {
	check(store.getTokens(BinaryExpression), ["a", "*", "b"]);
}

/**
 * Test retrieval of all tokens plus one before for binary expression.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensPlusOneBefore(store) {
	check(store.getTokens(BinaryExpression, 1), ["=", "a", "*", "b"]);
}

/**
 * Test retrieval of all tokens plus one after for binary expression.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensPlusOneAfter(store) {
	check(store.getTokens(BinaryExpression, 0, 1), [
		"a",
		"*",
		"b",
		"call",
	]);
}

/**
 * Test retrieval of all tokens plus two before and one after for binary expression.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensPlusTwoBeforeOneAfter(store) {
	check(store.getTokens(BinaryExpression, 2, 1), [
		"answer",
		"=",
		"a",
		"*",
		"b",
		"call",
	]);
}

/**
 * Test retrieval of all matched tokens for root node with filter.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensWithFilter(store) {
	check(
		store.getTokens(Program, t => t.type === "Identifier"),
		["answer", "a", "b", "call"],
	);
	check(
		store.getTokens(Program, {
			filter: t => t.type === "Identifier",
		}),
		["answer", "a", "b", "call"],
	);
}

/**
 * Test retrieval of all tokens and comments in the node for root node with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensWithIncludeComments(store) {
	check(store.getTokens(Program, { includeComments: true }), [
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
}

/**
 * Test retrieval of matched tokens and comments in the node for root node with includeComments and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensWithIncludeCommentsAndFilter(store) {
	check(
		store.getTokens(Program, {
			includeComments: true,
			filter: t => t.type.startsWith("Block"),
		}),
		["A", "B", "C", "D", "E", "Z"],
	);
}

/**
 * Test retrieval of all tokens and comments in the node for binary expression with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBinaryExpressionWithIncludeComments(store) {
	check(
		store.getTokens(BinaryExpression, { includeComments: true }),
		["a", "D", "*", "b"],
	);
}

/**
 * Test retrieval of tokens and comments from Program with leading and trailing comments and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensWithLeadingTrailingComments(store) {
	const code = " /*A*/ bar /*Z*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getTokens(ast), ["bar"]);
	check(tokenStore.getTokens(ast, { includeComments: true }), [
		"A",
		"bar",
		"Z",
	]);
}

/**
 * Test retrieval of zero tokens before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeZero(store) {
	check(store.getTokensBefore(BinaryExpression, 0), []);
}

/**
 * Test retrieval of one token before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeOne(store) {
	check(store.getTokensBefore(BinaryExpression, 1), ["="]);
}

/**
 * Test retrieval of more than one token before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeMoreThanOne(store) {
	check(store.getTokensBefore(BinaryExpression, 2), ["answer", "="]);
}

/**
 * Test retrieval of all tokens before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeAll(store) {
	check(store.getTokensBefore(BinaryExpression, 9e9), [
		"var",
		"answer",
		"=",
	]);
}

/**
 * Test retrieval of more than one token before a node with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithCountOption(store) {
	check(store.getTokensBefore(BinaryExpression, { count: 2 }), [
		"answer",
		"=",
	]);
}

/**
 * Test retrieval of matched tokens before a node with count and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithCountAndFilter(store) {
	check(
		store.getTokensBefore(BinaryExpression, {
			count: 1,
			filter: t => t.value !== "=",
		}),
		["answer"],
	);
}

/**
 * Test retrieval of all matched tokens before a node with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithFilter(store) {
	check(
		store.getTokensBefore(BinaryExpression, {
			filter: t => t.value !== "answer",
		}),
		["var", "="],
	);
}

/**
 * Test retrieval of no tokens before the root node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeNoTokens(store) {
	check(store.getTokensBefore(Program, { count: 1 }), []);
}

/**
 * Test retrieval of tokens and comments before a node with count and includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithCountAndIncludeComments(store) {
	check(
		store.getTokensBefore(BinaryExpression, {
			count: 3,
			includeComments: true,
		}),
		["B", "=", "C"],
	);
}

/**
 * Test retrieval of all tokens and comments before a node with includeComments option only.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithIncludeCommentsOnly(store) {
	check(
		store.getTokensBefore(BinaryExpression, {
			includeComments: true,
		}),
		["A", "var", "answer", "B", "=", "C"],
	);
}

/**
 * Test retrieval of all tokens and comments before a node with includeComments and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeWithIncludeCommentsAndFilter(store) {
	check(
		store.getTokensBefore(BinaryExpression, {
			includeComments: true,
			filter: t => t.type.startsWith("Block"),
		}),
		["A", "B", "C"],
	);
}

/**
 * Test retrieval of no tokens before Program when it starts with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeNoTokensWhitespace(store) {
	const code = " bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getTokensBefore(ast, 1), []);
}

/**
 * Test retrieval of no tokens before Program when it starts with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeNoTokensComment(store) {
	const code = "/*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getTokensBefore(ast, 1), []);
}

/**
 * Test retrieval of no tokens before Program when it starts with whitespace and a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBeforeNoTokensWhitespaceAndComment(store) {
	const code = " /*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(
		tokenStore.getTokensBefore(ast, {
			count: 1,
			includeComments: true,
		}),
		[],
	);
}

/**
 * Test retrieval of one token before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeOne(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression).value,
		"=",
	);
}

/**
 * Test skipping a given number of tokens.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeSkip(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, 1).value,
		"answer",
	);
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, 2).value,
		"var",
	);
}

/**
 * Test skipping a given number of tokens with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeSkipOption(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, { skip: 1 }).value,
		"answer",
	);
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, { skip: 2 }).value,
		"var",
	);
}

/**
 * Test retrieval of matched token with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeWithFilter(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, t => t.value !== "=")
			.value,
		"answer",
	);
}

/**
 * Test retrieval of matched token with skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeWithSkipAndFilter(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, {
			skip: 1,
			filter: t => t.value !== "=",
		}).value,
		"var",
	);
}

/**
 * Test retrieval of one token or comment before a node with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeWithIncludeComments(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, {
			includeComments: true,
		}).value,
		"C",
	);
}

/**
 * Test retrieval of one token or comment before a node with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, {
			includeComments: true,
			skip: 1,
		}).value,
		"=",
	);
}

/**
 * Test retrieval of one token or comment before a node with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getTokenBefore(BinaryExpression, {
			includeComments: true,
			skip: 1,
			filter: t => t.type.startsWith("Block"),
		}).value,
		"B",
	);
}

/**
 * Test retrieval of the previous node if the comment at the end of source code is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforePreviousNode(store) {
	const code = "a + b /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenBefore(ast.comments[0]);

	assert.strictEqual(token.value, "b");
}

/**
 * Test retrieval of the previous comment if the first token is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforePreviousComment(store) {
	const code = "/*comment*/ a + b";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenBefore(ast.tokens[0], {
		includeComments: true,
	});

	assert.strictEqual(token.value, "comment");
}

/**
 * Test retrieval of null if the first comment is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeNullFirstComment(store) {
	const code = "/*comment*/ a + b";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenBefore(ast.comments[0], {
		includeComments: true,
	});

	assert.strictEqual(token, null);
}

/**
 * Test retrieval of null before Program when it starts with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeNullWhitespace(store) {
	const code = " bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getTokenBefore(ast), null);
}

/**
 * Test retrieval of null before Program when it starts with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeNullComment(store) {
	const code = "/*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getTokenBefore(ast), null);
}

/**
 * Test retrieval of null before Program when it starts with whitespace and a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenBeforeNullWhitespaceAndComment(store) {
	const code = " /*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(
		tokenStore.getTokenBefore(ast, { includeComments: true }),
		null,
	);
}

/**
 * Test retrieval of zero tokens after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterZero(store) {
	check(store.getTokensAfter(VariableDeclarator.id, 0), []);
}

/**
 * Test retrieval of one token after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterOne(store) {
	check(store.getTokensAfter(VariableDeclarator.id, 1), ["="]);
}

/**
 * Test retrieval of more than one token after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterMoreThanOne(store) {
	check(store.getTokensAfter(VariableDeclarator.id, 2), ["=", "a"]);
}

/**
 * Test retrieval of all tokens after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterAll(store) {
	check(store.getTokensAfter(VariableDeclarator.id, 9e9), [
		"=",
		"a",
		"*",
		"b",
		"call",
		"(",
		")",
		";",
	]);
}

/**
 * Test retrieval of more than one token after a node with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithCountOption(store) {
	check(store.getTokensAfter(VariableDeclarator.id, { count: 2 }), [
		"=",
		"a",
	]);
}

/**
 * Test retrieval of all matched tokens after a node with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithFilter(store) {
	check(
		store.getTokensAfter(VariableDeclarator.id, {
			filter: t => t.type === "Identifier",
		}),
		["a", "b", "call"],
	);
}

/**
 * Test retrieval of matched tokens after a node with count and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithCountAndFilter(store) {
	check(
		store.getTokensAfter(VariableDeclarator.id, {
			count: 2,
			filter: t => t.type === "Identifier",
		}),
		["a", "b"],
	);
}

/**
 * Test retrieval of all tokens and comments after a node with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithIncludeComments(store) {
	check(
		store.getTokensAfter(VariableDeclarator.id, {
			includeComments: true,
		}),
		[
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
}

/**
 * Test retrieval of several tokens and comments after a node with includeComments and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithIncludeCommentsAndCount(store) {
	check(
		store.getTokensAfter(VariableDeclarator.id, {
			includeComments: true,
			count: 3,
		}),
		["B", "=", "C"],
	);
}

/**
 * Test retrieval of matched tokens and comments after a node with includeComments and count and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterWithIncludeCommentsCountAndFilter(store) {
	check(
		store.getTokensAfter(VariableDeclarator.id, {
			includeComments: true,
			count: 3,
			filter: t => t.type.startsWith("Block"),
		}),
		["B", "C", "D"],
	);
}

/**
 * Test retrieval of no tokens after Program when it ends with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterNoTokensWhitespace(store) {
	const code = "bar ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getTokensAfter(ast, 1), []);
}

/**
 * Test retrieval of no tokens after Program when it ends with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterNoTokensComment(store) {
	const code = "bar /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getTokensAfter(ast, 1), []);
}

/**
 * Test retrieval of no tokens after Program when it ends with a comment and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensAfterNoTokensCommentAndWhitespace(store) {
	const code = "bar /*comment*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(
		tokenStore.getTokensAfter(ast, {
			count: 1,
			includeComments: true,
		}),
		[],
	);
}

/**
 * Test retrieval of one token after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterOne(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id).value,
		"=",
	);
}

/**
 * Test skipping a given number of tokens.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterSkip(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, 1).value,
		"a",
	);
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, 2).value,
		"*",
	);
}

/**
 * Test skipping a given number of tokens with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterSkipOption(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, { skip: 1 }).value,
		"a",
	);
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, { skip: 2 }).value,
		"*",
	);
}

/**
 * Test retrieval of matched token with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterWithFilter(store) {
	assert.strictEqual(
		store.getTokenAfter(
			VariableDeclarator.id,
			t => t.type === "Identifier",
		).value,
		"a",
	);
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, {
			filter: t => t.type === "Identifier",
		}).value,
		"a",
	);
}

/**
 * Test retrieval of matched token with filter and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterWithFilterAndSkip(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, {
			skip: 1,
			filter: t => t.type === "Identifier",
		}).value,
		"b",
	);
}

/**
 * Test retrieval of one token or comment after a node with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterWithIncludeComments(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, {
			includeComments: true,
		}).value,
		"B",
	);
}

/**
 * Test retrieval of one token or comment after a node with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, {
			includeComments: true,
			skip: 2,
		}).value,
		"C",
	);
}

/**
 * Test retrieval of one token or comment after a node with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getTokenAfter(VariableDeclarator.id, {
			includeComments: true,
			skip: 2,
			filter: t => t.type.startsWith("Block"),
		}).value,
		"D",
	);
}

/**
 * Test retrieval of the next node if the comment at the first of source code is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNextNode(store) {
	const code = "/*comment*/ a + b";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenAfter(ast.comments[0]);

	assert.strictEqual(token.value, "a");
}

/**
 * Test retrieval of the next comment if the last token is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNextComment(store) {
	const code = "a + b /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenAfter(ast.tokens[2], {
		includeComments: true,
	});

	assert.strictEqual(token.value, "comment");
}

/**
 * Test retrieval of null if the last comment is specified.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNullLastComment(store) {
	const code = "a + b /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getTokenAfter(ast.comments[0], {
		includeComments: true,
	});

	assert.strictEqual(token, null);
}

/**
 * Test retrieval of null after Program when it ends with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNullWhitespace(store) {
	const code = "bar ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getTokenAfter(ast), null);
}

/**
 * Test retrieval of null after Program when it ends with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNullComment(store) {
	const code = "bar /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getTokenAfter(ast), null);
}

/**
 * Test retrieval of null after Program when it ends with a comment and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenAfterNullCommentAndWhitespace(store) {
	const code = "bar /*comment*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(
		tokenStore.getTokenAfter(ast, { includeComments: true }),
		null,
	);
}

/**
 * Test retrieval of zero tokens from a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensZero(store) {
	check(store.getFirstTokens(BinaryExpression, 0), []);
}

/**
 * Test retrieval of one token from a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensOne(store) {
	check(store.getFirstTokens(BinaryExpression, 1), ["a"]);
}

/**
 * Test retrieval of more than one token from a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensMoreThanOne(store) {
	check(store.getFirstTokens(BinaryExpression, 2), ["a", "*"]);
}

/**
 * Test retrieval of all tokens from a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensAll(store) {
	check(store.getFirstTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
}

/**
 * Test retrieval of more than one token from a node's token stream with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithCountOption(store) {
	check(store.getFirstTokens(BinaryExpression, { count: 2 }), [
		"a",
		"*",
	]);
}

/**
 * Test retrieval of matched tokens from a node's token stream with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithFilter(store) {
	check(
		store.getFirstTokens(
			BinaryExpression,
			t => t.type === "Identifier",
		),
		["a", "b"],
	);
	check(
		store.getFirstTokens(BinaryExpression, {
			filter: t => t.type === "Identifier",
		}),
		["a", "b"],
	);
}

/**
 * Test retrieval of matched tokens from a node's token stream with filter and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithFilterAndCount(store) {
	check(
		store.getFirstTokens(BinaryExpression, {
			count: 1,
			filter: t => t.type === "Identifier",
		}),
		["a"],
	);
}

/**
 * Test retrieval of all tokens and comments from a node's token stream with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithIncludeComments(store) {
	check(
		store.getFirstTokens(BinaryExpression, {
			includeComments: true,
		}),
		["a", "D", "*", "b"],
	);
}

/**
 * Test retrieval of several tokens and comments from a node's token stream with includeComments and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithIncludeCommentsAndCount(store) {
	check(
		store.getFirstTokens(BinaryExpression, {
			includeComments: true,
			count: 3,
		}),
		["a", "D", "*"],
	);
}

/**
 * Test retrieval of several tokens and comments from a node's token stream with includeComments and count and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWithIncludeCommentsCountAndFilter(store) {
	check(
		store.getFirstTokens(BinaryExpression, {
			includeComments: true,
			count: 3,
			filter: t => t.value !== "a",
		}),
		["D", "*", "b"],
	);
}

/**
 * Test retrieval of the first token from Program when it starts with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWhitespace(store) {
	const code = " bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
}

/**
 * Test retrieval of the first token from Program when it starts with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensComment(store) {
	const code = "/*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getFirstTokens(ast, 1), ["bar"]);
}

/**
 * Test retrieval of the first token/comment from Program when it starts with whitespace and a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensWhitespaceAndComment(store) {
	const code = " /*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(
		tokenStore.getFirstTokens(ast, {
			count: 2,
			includeComments: true,
		}),
		["comment", "bar"],
	);
}

/**
 * Test retrieval of the first token of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstToken(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression).value,
		"a",
	);
}

/**
 * Test skipping a given number of tokens.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenSkip(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, 1).value,
		"*",
	);
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, 2).value,
		"b",
	);
}

/**
 * Test skipping a given number of tokens with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenSkipOption(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, { skip: 1 }).value,
		"*",
	);
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, { skip: 2 }).value,
		"b",
	);
}

/**
 * Test retrieval of matched token with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithFilter(store) {
	assert.strictEqual(
		store.getFirstToken(
			BinaryExpression,
			t => t.type === "Identifier",
		).value,
		"a",
	);
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, {
			filter: t => t.type === "Identifier",
		}).value,
		"a",
	);
}

/**
 * Test retrieval of matched token with filter and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithFilterAndSkip(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, {
			skip: 1,
			filter: t => t.type === "Identifier",
		}).value,
		"b",
	);
}

/**
 * Test retrieval of the first token or comment of a node's token stream with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithIncludeComments(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, { includeComments: true })
			.value,
		"a",
	);
}

/**
 * Test retrieval of the first matched token or comment of a node's token stream with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, {
			includeComments: true,
			skip: 1,
		}).value,
		"D",
	);
}

/**
 * Test retrieval of the first matched token or comment of a node's token stream with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getFirstToken(BinaryExpression, {
			includeComments: true,
			skip: 1,
			filter: t => t.value !== "a",
		}).value,
		"*",
	);
}

/**
 * Test retrieval of the first comment if the comment is at the last of nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenFirstComment(store) {
	const code = "a + b\n/*comment*/ c + d";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);

	/*
	 * A node must not start with a token: it can start with a comment or be empty.
	 * This test case is needed for completeness.
	 */
	const token = tokenStore.getFirstToken(
		{ range: [ast.comments[0].range[0], ast.tokens[5].range[1]] },
		{ includeComments: true },
	);

	assert.strictEqual(token.value, "comment");
}

/**
 * Test retrieval of the first token (without includeComments option) if the comment is at the last of nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenFirstTokenWithoutIncludeComments(store) {
	const code = "a + b\n/*comment*/ c + d";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);

	/*
	 * A node must not start with a token: it can start with a comment or be empty.
	 * This test case is needed for completeness.
	 */
	const token = tokenStore.getFirstToken({
		range: [ast.comments[0].range[0], ast.tokens[5].range[1]],
	});

	assert.strictEqual(token.value, "c");
}

/**
 * Test retrieval of the first token if the root node contains a trailing comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWithTrailingComment(store) {
	const parser = require("../../../../fixtures/parsers/all-comments-parser");
	const code = "foo // comment";
	const ast = parser.parse(code, {
		loc: true,
		range: true,
		tokens: true,
		comment: true,
	});
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getFirstToken(ast);

	assert.strictEqual(token, ast.tokens[0]);
}

/**
 * Test returning null if the source contains only comments.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenNullOnlyComments(store) {
	const code = "// comment";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getFirstToken(ast, {
		filter() {
			assert.fail("Unexpected call to filter callback");
		},
	});

	assert.strictEqual(token, null);
}

/**
 * Test returning null if the source is empty.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenNullEmptySource(store) {
	const code = "";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getFirstToken(ast);

	assert.strictEqual(token, null);
}

/**
 * Test retrieval of the first token from Program when it starts with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWhitespace(store) {
	const code = " bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
}

/**
 * Test retrieval of the first token from Program when it starts with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenComment(store) {
	const code = "/*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getFirstToken(ast).value, "bar");
}

/**
 * Test retrieval of the first token from Program when it starts with whitespace and a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenWhitespaceAndComment(store) {
	const code = " /*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(
		tokenStore.getFirstToken(ast, { includeComments: true }).value,
		"comment",
	);
}

/**
 * Test retrieval of zero tokens from the end of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensZero(store) {
	check(store.getLastTokens(BinaryExpression, 0), []);
}

/**
 * Test retrieval of one token from the end of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensOne(store) {
	check(store.getLastTokens(BinaryExpression, 1), ["b"]);
}

/**
 * Test retrieval of more than one token from the end of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensMoreThanOne(store) {
	check(store.getLastTokens(BinaryExpression, 2), ["*", "b"]);
}

/**
 * Test retrieval of all tokens from the end of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensAll(store) {
	check(store.getLastTokens(BinaryExpression, 9e9), ["a", "*", "b"]);
}

/**
 * Test retrieval of more than one token from the end of a node's token stream with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithCountOption(store) {
	check(store.getLastTokens(BinaryExpression, { count: 2 }), [
		"*",
		"b",
	]);
}

/**
 * Test retrieval of matched tokens from the end of a node's token stream with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithFilter(store) {
	check(
		store.getLastTokens(
			BinaryExpression,
			t => t.type === "Identifier",
		),
		["a", "b"],
	);
	check(
		store.getLastTokens(BinaryExpression, {
			filter: t => t.type === "Identifier",
		}),
		["a", "b"],
	);
}

/**
 * Test retrieval of matched tokens from the end of a node's token stream with filter and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithFilterAndCount(store) {
	check(
		store.getLastTokens(BinaryExpression, {
			count: 1,
			filter: t => t.type === "Identifier",
		}),
		["b"],
	);
}

/**
 * Test retrieval of all tokens from the end of a node's token stream with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithIncludeComments(store) {
	check(
		store.getLastTokens(BinaryExpression, {
			includeComments: true,
		}),
		["a", "D", "*", "b"],
	);
}

/**
 * Test retrieval of matched tokens from the end of a node's token stream with includeComments and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithIncludeCommentsAndCount(store) {
	check(
		store.getLastTokens(BinaryExpression, {
			includeComments: true,
			count: 3,
		}),
		["D", "*", "b"],
	);
}

/**
 * Test retrieval of matched tokens from the end of a node's token stream with includeComments and count and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWithIncludeCommentsCountAndFilter(store) {
	check(
		store.getLastTokens(BinaryExpression, {
			includeComments: true,
			count: 3,
			filter: t => t.type !== "Punctuator",
		}),
		["a", "D", "b"],
	);
}

/**
 * Test retrieval of the last token from Program when it ends with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensWhitespace(store) {
	const code = "bar ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getLastTokens(ast, 1), ["bar"]);
}

/**
 * Test retrieval of the last token from Program when it ends with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensComment(store) {
	const code = "bar /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getLastTokens(ast, 1), ["bar"]);
}

/**
 * Test retrieval of the last token/comment from Program when it ends with a comment and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensCommentAndWhitespace(store) {
	const code = "bar /*comment*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(
		tokenStore.getLastTokens(ast, {
			count: 2,
			includeComments: true,
		}),
		["bar", "comment"],
	);
}

/**
 * Test retrieval of the last token of a node's token stream.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastToken(store) {
	assert.strictEqual(store.getLastToken(BinaryExpression).value, "b");
	assert.strictEqual(
		store.getLastToken(VariableDeclaration).value,
		"b",
	);
}

/**
 * Test skipping a given number of tokens.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenSkip(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, 1).value,
		"*",
	);
	assert.strictEqual(
		store.getLastToken(BinaryExpression, 2).value,
		"a",
	);
}

/**
 * Test skipping a given number of tokens with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenSkipOption(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, { skip: 1 }).value,
		"*",
	);
	assert.strictEqual(
		store.getLastToken(BinaryExpression, { skip: 2 }).value,
		"a",
	);
}

/**
 * Test retrieval of the last matched token of a node's token stream with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithFilter(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, t => t.value !== "b")
			.value,
		"*",
	);
	assert.strictEqual(
		store.getLastToken(BinaryExpression, {
			filter: t => t.value !== "b",
		}).value,
		"*",
	);
}

/**
 * Test retrieval of the last matched token of a node's token stream with filter and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithFilterAndSkip(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, {
			skip: 1,
			filter: t => t.type === "Identifier",
		}).value,
		"a",
	);
}

/**
 * Test retrieval of the last token of a node's token stream with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithIncludeComments(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, { includeComments: true })
			.value,
		"b",
	);
}

/**
 * Test retrieval of the last token of a node's token stream with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, {
			includeComments: true,
			skip: 2,
		}).value,
		"D",
	);
}

/**
 * Test retrieval of the last token of a node's token stream with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getLastToken(BinaryExpression, {
			includeComments: true,
			skip: 1,
			filter: t => t.type !== "Identifier",
		}).value,
		"D",
	);
}

/**
 * Test retrieval of the last comment if the comment is at the last of nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenLastComment(store) {
	const code = "a + b /*comment*/\nc + d";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);

	/*
	 * A node must not end with a token: it can end with a comment or be empty.
	 * This test case is needed for completeness.
	 */
	const token = tokenStore.getLastToken(
		{ range: [ast.tokens[0].range[0], ast.comments[0].range[1]] },
		{ includeComments: true },
	);

	assert.strictEqual(token.value, "comment");
}

/**
 * Test retrieval of the last token (without includeComments option) if the comment is at the last of nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenLastTokenWithoutIncludeComments(store) {
	const code = "a + b /*comment*/\nc + d";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);

	/*
	 * A node must not end with a token: it can end with a comment or be empty.
	 * This test case is needed for completeness.
	 */
	const token = tokenStore.getLastToken({
		range: [ast.tokens[0].range[0], ast.comments[0].range[1]],
	});

	assert.strictEqual(token.value, "b");
}

/**
 * Test retrieval of the last token if the root node contains a trailing comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWithTrailingComment(store) {
	const parser = require("../../../../fixtures/parsers/all-comments-parser");
	const code = "foo // comment";
	const ast = parser.parse(code, {
		loc: true,
		range: true,
		tokens: true,
		comment: true,
	});
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getLastToken(ast);

	assert.strictEqual(token, ast.tokens[0]);
}

/**
 * Test retrieval of the last token from Program when it ends with whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenWhitespace(store) {
	const code = "bar ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
}

/**
 * Test retrieval of the last token from Program when it ends with a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenComment(store) {
	const code = "bar /*comment*/";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(tokenStore.getLastToken(ast).value, "bar");
}

/**
 * Test retrieval of the last token from Program when it ends with a comment and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenCommentAndWhitespace(store) {
	const code = "bar /*comment*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	assert.strictEqual(
		tokenStore.getLastToken(ast, { includeComments: true }).value,
		"comment",
	);
}

/**
 * Test returning null if the source contains only comments.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenNullOnlyComments(store) {
	const code = "// comment";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getLastToken(ast, {
		filter() {
			assert.fail("Unexpected call to filter callback");
		},
	});

	assert.strictEqual(token, null);
}

/**
 * Test returning null if the source is empty.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenNullEmptySource(store) {
	const code = "";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const token = tokenStore.getLastToken(ast);

	assert.strictEqual(token, null);
}

/**
 * Test retrieval of zero tokens between adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenZero(store) {
	check(
		store.getFirstTokensBetween(BinaryExpression, CallExpression),
		[],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenMultipleWithCount(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			2,
		),
		["=", "a"],
	);
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ count: 2 },
		),
		["=", "a"],
	);
}

/**
 * Test retrieval of matched tokens between non-adjacent nodes with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenWithFilter(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ filter: t => t.type !== "Punctuator" },
		),
		["a"],
	);
}

/**
 * Test retrieval of all tokens between non-adjacent nodes with empty object option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenAllWithEmptyObject(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{},
		),
		["=", "a", "*"],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenWithIncludeComments(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true },
		),
		["B", "=", "C", "a", "D", "*"],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes with includeComments and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenWithIncludeCommentsAndCount(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true, count: 3 },
		),
		["B", "=", "C"],
	);
}

/**
 * Test retrieval of multiple tokens and comments between non-adjacent nodes with includeComments and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokensBetweenWithIncludeCommentsAndFilter(store) {
	check(
		store.getFirstTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{
				includeComments: true,
				filter: t => t.type !== "Punctuator",
			},
		),
		["B", "C", "a", "D"],
	);
}

/**
 * Test returning null between adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenNull(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(BinaryExpression, CallExpression),
		null,
	);
}

/**
 * Test retrieval of one token between non-adjacent nodes with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenOne(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
		).value,
		"=",
	);
}

/**
 * Test retrieval of one token between non-adjacent nodes with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenWithSkip(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			1,
		).value,
		"a",
	);
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 2 },
		).value,
		"*",
	);
}

/**
 * Test returning null if it's skipped beyond the right token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenNullBeyondRightToken(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 3 },
		),
		null,
	);
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 4 },
		),
		null,
	);
}

/**
 * Test retrieval of the first matched token between non-adjacent nodes with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenWithFilter(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ filter: t => t.type !== "Identifier" },
		).value,
		"=",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenWithIncludeComments(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true },
		).value,
		"B",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true, skip: 1 },
		).value,
		"=",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenBetweenWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getFirstTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{
				includeComments: true,
				skip: 1,
				filter: t => t.type !== "Punctuator",
			},
		).value,
		"C",
	);
}

/**
 * Test retrieval of zero tokens between adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenZero(store) {
	check(
		store.getLastTokensBetween(BinaryExpression, CallExpression),
		[],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenMultipleWithCount(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			2,
		),
		["a", "*"],
	);
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ count: 2 },
		),
		["a", "*"],
	);
}

/**
 * Test retrieval of matched tokens between non-adjacent nodes with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenWithFilter(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ filter: t => t.type !== "Punctuator" },
		),
		["a"],
	);
}

/**
 * Test retrieval of all tokens between non-adjacent nodes with empty object option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenAllWithEmptyObject(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{},
		),
		["=", "a", "*"],
	);
}

/**
 * Test retrieval of all tokens and comments between non-adjacent nodes with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenWithIncludeComments(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true },
		),
		["B", "=", "C", "a", "D", "*"],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes with includeComments and count options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenWithIncludeCommentsAndCount(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true, count: 3 },
		),
		["a", "D", "*"],
	);
}

/**
 * Test retrieval of multiple tokens and comments between non-adjacent nodes with includeComments and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokensBetweenWithIncludeCommentsAndFilter(store) {
	check(
		store.getLastTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{
				includeComments: true,
				filter: t => t.type !== "Punctuator",
			},
		),
		["B", "C", "a", "D"],
	);
}

/**
 * Test returning null between adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenNull(store) {
	assert.strictEqual(
		store.getLastTokenBetween(BinaryExpression, CallExpression),
		null,
	);
}

/**
 * Test retrieval of one token between non-adjacent nodes with count option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenOne(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
		).value,
		"*",
	);
}

/**
 * Test retrieval of one token between non-adjacent nodes with skip option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenWithSkip(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			1,
		).value,
		"a",
	);
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 2 },
		).value,
		"=",
	);
}

/**
 * Test returning null if it's skipped beyond the right token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenNullBeyondRightToken(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 3 },
		),
		null,
	);
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ skip: 4 },
		),
		null,
	);
}

/**
 * Test retrieval of the first matched token between non-adjacent nodes with filter option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenWithFilter(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ filter: t => t.type !== "Identifier" },
		).value,
		"*",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments option.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenWithIncludeComments(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true },
		).value,
		"*",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments and skip options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenWithIncludeCommentsAndSkip(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{ includeComments: true, skip: 1 },
		).value,
		"D",
	);
}

/**
 * Test retrieval of first token or comment between non-adjacent nodes with includeComments and skip and filter options.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenBetweenWithIncludeCommentsSkipAndFilter(store) {
	assert.strictEqual(
		store.getLastTokenBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
			{
				includeComments: true,
				skip: 1,
				filter: t => t.type !== "Punctuator",
			},
		).value,
		"a",
	);
}

/**
 * Test retrieval of zero tokens between adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBetweenZero(store) {
	check(store.getTokensBetween(BinaryExpression, CallExpression), []);
}

/**
 * Test retrieval of one token between nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBetweenOne(store) {
	check(
		store.getTokensBetween(
			BinaryExpression.left,
			BinaryExpression.right,
		),
		["*"],
	);
}

/**
 * Test retrieval of multiple tokens between non-adjacent nodes.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBetweenMultiple(store) {
	check(
		store.getTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.right,
		),
		["=", "a", "*"],
	);
}

/**
 * Test retrieval of surrounding tokens when asked for padding.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokensBetweenWithPadding(store) {
	check(
		store.getTokensBetween(
			VariableDeclarator.id,
			BinaryExpression.left,
			2,
		),
		["var", "answer", "=", "a", "*"],
	);
}

/**
 * Test returning identifier token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenByRangeStartIdentifier(store) {
	const result = store.getTokenByRangeStart(9);

	assert.strictEqual(result.type, "Identifier");
	assert.strictEqual(result.value, "answer");
}

/**
 * Test returning null when token doesn't exist.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenByRangeStartNull(store) {
	const result = store.getTokenByRangeStart(10);

	assert.isNull(result);
}

/**
 * Test returning a comment token when includeComments is true.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenByRangeStartCommentTrue(store) {
	const result = store.getTokenByRangeStart(15, {
		includeComments: true,
	});

	assert.strictEqual(result.type, "Block");
	assert.strictEqual(result.value, "B");
}

/**
 * Test not returning a comment token at the supplied index when includeComments is false.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenByRangeStartCommentFalse(store) {
	const result = store.getTokenByRangeStart(15, {
		includeComments: false,
	});

	assert.isNull(result);
}

/**
 * Test not returning comment tokens by default.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetTokenByRangeStartDefault(store) {
	const result = store.getTokenByRangeStart(15);

	assert.isNull(result);
}

/**
 * Test retrieval of all tokens and comments in the node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenAndGetTokenAfter(store) {
	const code = "(function(a, /*b,*/ c){})";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const tokens = [];
	let token = tokenStore.getFirstToken(ast);

	while (token) {
		tokens.push(token);
		token = tokenStore.getTokenAfter(token, {
			includeComments: true,
		});
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
}

/**
 * Test retrieval of all tokens and comments in the node (no spaces).
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetFirstTokenAndGetTokenAfterNoSpaces(store) {
	const code = "(function(a,/*b,*/c){})";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const tokens = [];
	let token = tokenStore.getFirstToken(ast);

	while (token) {
		tokens.push(token);
		token = tokenStore.getTokenAfter(token, {
			includeComments: true,
		});
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
}

/**
 * Test retrieval of all tokens and comments in the node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenAndGetTokenBefore(store) {
	const code = "(function(a, /*b,*/ c){})";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const tokens = [];
	let token = tokenStore.getLastToken(ast);

	while (token) {
		tokens.push(token);
		token = tokenStore.getTokenBefore(token, {
			includeComments: true,
		});
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
}

/**
 * Test retrieval of all tokens and comments in the node (no spaces).
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetLastTokenAndGetTokenBeforeNoSpaces(store) {
	const code = "(function(a,/*b,*/c){})";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	const tokens = [];
	let token = tokenStore.getLastToken(ast);

	while (token) {
		tokens.push(token);
		token = tokenStore.getTokenBefore(token, {
			includeComments: true,
		});
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
}

/**
 * Test retrieving false if comments don't exist.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testCommentsExistBetweenFalse(store) {
	assert.isFalse(
		store.commentsExistBetween(AST.tokens[0], AST.tokens[1]),
	);
}

/**
 * Test retrieving true if comments exist.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testCommentsExistBetweenTrue(store) {
	assert.isTrue(
		store.commentsExistBetween(AST.tokens[1], AST.tokens[2]),
	);
}

/**
 * Test retrieving comments before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeNode(store) {
	assert.strictEqual(
		store.getCommentsBefore(VariableDeclaration)[0].value,
		"A",
	);
}

/**
 * Test retrieving comments before a token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeToken(store) {
	assert.strictEqual(
		store.getCommentsBefore(TOKENS[2] /* "=" token */)[0].value,
		"B",
	);
}

/**
 * Test retrieving multiple comments before a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeMultiple(store) {
	const comments = store.getCommentsBefore(CallExpression);

	assert.strictEqual(comments.length, 2);
	assert.strictEqual(comments[0].value, "E");
	assert.strictEqual(comments[1].value, "F");
}

/**
 * Test returning an empty array for a Program node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeProgramNode(store) {
	check(store.getCommentsBefore(Program), []);
}

/**
 * Test returning an empty array if there are no comments before a node or token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeEmptyArray(store) {
	check(store.getCommentsBefore(BinaryExpression.right), []);
	check(store.getCommentsBefore(TOKENS[1]), []);
}

/**
 * Test retrieving no comments before Program when it starts with whitespace and a comment.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsBeforeNoCommentsWhitespaceAndComment(store) {
	const code = " /*comment*/ bar";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getCommentsBefore(ast), []);
}

/**
 * Test retrieving comments after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterNode(store) {
	assert.strictEqual(
		store.getCommentsAfter(VariableDeclarator.id)[0].value,
		"B",
	);
}

/**
 * Test retrieving comments after a token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterToken(store) {
	assert.strictEqual(
		store.getCommentsAfter(TOKENS[2] /* "=" token */)[0].value,
		"C",
	);
}

/**
 * Test retrieving multiple comments after a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterMultiple(store) {
	const comments = store.getCommentsAfter(VariableDeclaration);

	assert.strictEqual(comments.length, 2);
	assert.strictEqual(comments[0].value, "E");
	assert.strictEqual(comments[1].value, "F");
}

/**
 * Test returning an empty array for a Program node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterProgramNode(store) {
	check(store.getCommentsAfter(Program), []);
}

/**
 * Test returning an empty array if there are no comments after a node or token.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterEmptyArray(store) {
	check(store.getCommentsAfter(CallExpression.callee), []);
	check(store.getCommentsAfter(TOKENS[0]), []);
}

/**
 * Test retrieving no comments after Program when it ends with a comment and whitespace.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsAfterNoCommentsCommentAndWhitespace(store) {
	const code = "bar /*comment*/ ";
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const tokenStore = new TokenStore(ast.tokens, ast.comments);
	check(tokenStore.getCommentsAfter(ast), []);
}

/**
 * Test retrieving comments inside a node.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsInside(store) {
	check(store.getCommentsInside(Program), [
		"A",
		"B",
		"C",
		"D",
		"E",
		"F",
		"Z",
	]);
	check(store.getCommentsInside(VariableDeclaration), [
		"B",
		"C",
		"D",
	]);
	check(store.getCommentsInside(VariableDeclarator), ["B", "C", "D"]);
	check(store.getCommentsInside(BinaryExpression), ["D"]);
}

/**
 * Test returning an empty array if a node does not contain any comments.
 * @param {TokenStore} store The token store instance.
 * @returns {void}
 */
function testGetCommentsInsideEmptyArray(store) {
	check(store.getCommentsInside(TOKENS[2]), []);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		it("should retrieve all tokens for root node", () => {
			testGetTokensRootNode(store);
		});

		it("should retrieve all tokens for binary expression", () => {
			testGetTokensBinaryExpression(store);
		});

		it("should retrieve all tokens plus one before for binary expression", () => {
			testGetTokensPlusOneBefore(store);
		});

		it("should retrieve all tokens plus one after for binary expression", () => {
			testGetTokensPlusOneAfter(store);
		});

		it("should retrieve all tokens plus two before and one after for binary expression", () => {
			testGetTokensPlusTwoBeforeOneAfter(store);
		});

		it("should retrieve all matched tokens for root node with filter", () => {
			testGetTokensWithFilter(store);
		});

		it("should retrieve all tokens and comments in the node for root node with includeComments option", () => {
			testGetTokensWithIncludeComments(store);
		});

		it("should retrieve matched tokens and comments in the node for root node with includeComments and filter options", () => {
			testGetTokensWithIncludeCommentsAndFilter(store);
		});

		it("should retrieve all tokens and comments in the node for binary expression with includeComments option", () => {
			testGetTokensBinaryExpressionWithIncludeComments(store);
		});

		it("should retrieve tokens and comments from Program with leading and trailing comments and whitespace", () => {
			testGetTokensWithLeadingTrailingComments(store);
		});
	});

	describe("when calling getTokensBefore", () => {
		it("should retrieve zero tokens before a node", () => {
			testGetTokensBeforeZero(store);
		});

		it("should retrieve one token before a node", () => {
			testGetTokensBeforeOne(store);
		});

		it("should retrieve more than one token before a node", () => {
			testGetTokensBeforeMoreThanOne(store);
		});

		it("should retrieve all tokens before a node", () => {
			testGetTokensBeforeAll(store);
		});

		it("should retrieve more than one token before a node with count option", () => {
			testGetTokensBeforeWithCountOption(store);
		});

		it("should retrieve matched tokens before a node with count and filter options", () => {
			testGetTokensBeforeWithCountAndFilter(store);
		});

		it("should retrieve all matched tokens before a node with filter option", () => {
			testGetTokensBeforeWithFilter(store);
		});

		it("should retrieve no tokens before the root node", () => {
			testGetTokensBeforeNoTokens(store);
		});

		it("should retrieve tokens and comments before a node with count and includeComments option", () => {
			testGetTokensBeforeWithCountAndIncludeComments(store);
		});

		it("should retrieve all tokens and comments before a node with includeComments option only", () => {
			testGetTokensBeforeWithIncludeCommentsOnly(store);
		});

		it("should retrieve all tokens and comments before a node with includeComments and filter options", () => {
			testGetTokensBeforeWithIncludeCommentsAndFilter(store);
		});

		it("should retrieve no tokens before Program when it starts with whitespace", () => {
			testGetTokensBeforeNoTokensWhitespace(store);
		});

		it("should retrieve no tokens before Program when it starts with a comment", () => {
			testGetTokensBeforeNoTokensComment(store);
		});

		it("should retrieve no tokens before Program when it starts with whitespace and a comment", () => {
			testGetTokensBeforeNoTokensWhitespaceAndComment(store);
		});
	});

	describe("when calling getTokenBefore", () => {
		it("should retrieve one token before a node", () => {
			testGetTokenBeforeOne(store);
		});

		it("should skip a given number of tokens", () => {
			testGetTokenBeforeSkip(store);
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetTokenBeforeSkipOption(store);
		});

		it("should retrieve matched token with filter option", () => {
			testGetTokenBeforeWithFilter(store);
		});

		it("should retrieve matched token with skip and filter options", () => {
			testGetTokenBeforeWithSkipAndFilter(store);
		});

		it("should retrieve one token or comment before a node with includeComments option", () => {
			testGetTokenBeforeWithIncludeComments(store);
		});

		it("should retrieve one token or comment before a node with includeComments and skip options", () => {
			testGetTokenBeforeWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve one token or comment before a node with includeComments and skip and filter options", () => {
			testGetTokenBeforeWithIncludeCommentsSkipAndFilter(store);
		});

		it("should retrieve the previous node if the comment at the end of source code is specified.", () => {
			testGetTokenBeforePreviousNode(store);
		});

		it("should retrieve the previous comment if the first token is specified.", () => {
			testGetTokenBeforePreviousComment(store);
		});

		it("should retrieve null if the first comment is specified.", () => {
			testGetTokenBeforeNullFirstComment(store);
		});

		it("should retrieve null before Program when it starts with whitespace", () => {
			testGetTokenBeforeNullWhitespace(store);
		});

		it("should retrieve null before Program when it starts with a comment", () => {
			testGetTokenBeforeNullComment(store);
		});

		it("should retrieve null before Program when it starts with whitespace and a comment", () => {
			testGetTokenBeforeNullWhitespaceAndComment(store);
		});
	});

	describe("when calling getTokensAfter", () => {
		it("should retrieve zero tokens after a node", () => {
			testGetTokensAfterZero(store);
		});

		it("should retrieve one token after a node", () => {
			testGetTokensAfterOne(store);
		});

		it("should retrieve more than one token after a node", () => {
			testGetTokensAfterMoreThanOne(store);
		});

		it("should retrieve all tokens after a node", () => {
			testGetTokensAfterAll(store);
		});

		it("should retrieve more than one token after a node with count option", () => {
			testGetTokensAfterWithCountOption(store);
		});

		it("should retrieve all matched tokens after a node with filter option", () => {
			testGetTokensAfterWithFilter(store);
		});

		it("should retrieve matched tokens after a node with count and filter options", () => {
			testGetTokensAfterWithCountAndFilter(store);
		});

		it("should retrieve all tokens and comments after a node with includeComments option", () => {
			testGetTokensAfterWithIncludeComments(store);
		});

		it("should retrieve several tokens and comments after a node with includeComments and count options", () => {
			testGetTokensAfterWithIncludeCommentsAndCount(store);
		});

		it("should retrieve matched tokens and comments after a node with includeComments and count and filter options", () => {
			testGetTokensAfterWithIncludeCommentsCountAndFilter(store);
		});

		it("should retrieve no tokens after Program when it ends with whitespace", () => {
			testGetTokensAfterNoTokensWhitespace(store);
		});

		it("should retrieve no tokens after Program when it ends with a comment", () => {
			testGetTokensAfterNoTokensComment(store);
		});

		it("should retrieve no tokens after Program when it ends with a comment and whitespace", () => {
			testGetTokensAfterNoTokensCommentAndWhitespace(store);
		});
	});

	describe("when calling getTokenAfter", () => {
		it("should retrieve one token after a node", () => {
			testGetTokenAfterOne(store);
		});

		it("should skip a given number of tokens", () => {
			testGetTokenAfterSkip(store);
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetTokenAfterSkipOption(store);
		});

		it("should retrieve matched token with filter option", () => {
			testGetTokenAfterWithFilter(store);
		});

		it("should retrieve matched token with filter and skip options", () => {
			testGetTokenAfterWithFilterAndSkip(store);
		});

		it("should retrieve one token or comment after a node with includeComments option", () => {
			testGetTokenAfterWithIncludeComments(store);
		});

		it("should retrieve one token or comment after a node with includeComments and skip options", () => {
			testGetTokenAfterWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve one token or comment after a node with includeComments and skip and filter options", () => {
			testGetTokenAfterWithIncludeCommentsSkipAndFilter(store);
		});

		it("should retrieve the next node if the comment at the first of source code is specified.", () => {
			testGetTokenAfterNextNode(store);
		});

		it("should retrieve the next comment if the last token is specified.", () => {
			testGetTokenAfterNextComment(store);
		});

		it("should retrieve null if the last comment is specified.", () => {
			testGetTokenAfterNullLastComment(store);
		});

		it("should retrieve null after Program when it ends with whitespace", () => {
			testGetTokenAfterNullWhitespace(store);
		});

		it("should retrieve null after Program when it ends with a comment", () => {
			testGetTokenAfterNullComment(store);
		});

		it("should retrieve null after Program when it ends with a comment and whitespace", () => {
			testGetTokenAfterNullCommentAndWhitespace(store);
		});
	});

	describe("when calling getFirstTokens", () => {
		it("should retrieve zero tokens from a node's token stream", () => {
			testGetFirstTokensZero(store);
		});

		it("should retrieve one token from a node's token stream", () => {
			testGetFirstTokensOne(store);
		});

		it("should retrieve more than one token from a node's token stream", () => {
			testGetFirstTokensMoreThanOne(store);
		});

		it("should retrieve all tokens from a node's token stream", () => {
			testGetFirstTokensAll(store);
		});

		it("should retrieve more than one token from a node's token stream with count option", () => {
			testGetFirstTokensWithCountOption(store);
		});

		it("should retrieve matched tokens from a node's token stream with filter option", () => {
			testGetFirstTokensWithFilter(store);
		});

		it("should retrieve matched tokens from a node's token stream with filter and count options", () => {
			testGetFirstTokensWithFilterAndCount(store);
		});

		it("should retrieve all tokens and comments from a node's token stream with includeComments option", () => {
			testGetFirstTokensWithIncludeComments(store);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count options", () => {
			testGetFirstTokensWithIncludeCommentsAndCount(store);
		});

		it("should retrieve several tokens and comments from a node's token stream with includeComments and count and filter options", () => {
			testGetFirstTokensWithIncludeCommentsCountAndFilter(store);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			testGetFirstTokensWhitespace(store);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			testGetFirstTokensComment(store);
		});

		it("should retrieve the first token/comment from Program when it starts with whitespace and a comment", () => {
			testGetFirstTokensWhitespaceAndComment(store);
		});
	});

	describe("when calling getFirstToken", () => {
		it("should retrieve the first token of a node's token stream", () => {
			testGetFirstToken(store);
		});

		it("should skip a given number of tokens", () => {
			testGetFirstTokenSkip(store);
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetFirstTokenSkipOption(store);
		});

		it("should retrieve matched token with filter option", () => {
			testGetFirstTokenWithFilter(store);
		});

		it("should retrieve matched token with filter and skip options", () => {
			testGetFirstTokenWithFilterAndSkip(store);
		});

		it("should retrieve the first token or comment of a node's token stream with includeComments option", () => {
			testGetFirstTokenWithIncludeComments(store);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip options", () => {
			testGetFirstTokenWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve the first matched token or comment of a node's token stream with includeComments and skip and filter options", () => {
			testGetFirstTokenWithIncludeCommentsSkipAndFilter(store);
		});

		it("should retrieve the first comment if the comment is at the last of nodes", () => {
			testGetFirstTokenFirstComment(store);
		});

		it("should retrieve the first token (without includeComments option) if the comment is at the last of nodes", () => {
			testGetFirstTokenFirstTokenWithoutIncludeComments(store);
		});

		it("should retrieve the first token if the root node contains a trailing comment", () => {
			testGetFirstTokenWithTrailingComment(store);
		});

		it("should return null if the source contains only comments", () => {
			testGetFirstTokenNullOnlyComments(store);
		});

		it("should return null if the source is empty", () => {
			testGetFirstTokenNullEmptySource(store);
		});

		it("should retrieve the first token from Program when it starts with whitespace", () => {
			testGetFirstTokenWhitespace(store);
		});

		it("should retrieve the first token from Program when it starts with a comment", () => {
			testGetFirstTokenComment(store);
		});

		it("should retrieve the first token from Program when it starts with whitespace and a comment", () => {
			testGetFirstTokenWhitespaceAndComment(store);
		});
	});

	describe("when calling getLastTokens", () => {
		it("should retrieve zero tokens from the end of a node's token stream", () => {
			testGetLastTokensZero(store);
		});

		it("should retrieve one token from the end of a node's token stream", () => {
			testGetLastTokensOne(store);
		});

		it("should retrieve more than one token from the end of a node's token stream", () => {
			testGetLastTokensMoreThanOne(store);
		});

		it("should retrieve all tokens from the end of a node's token stream", () => {
			testGetLastTokensAll(store);
		});

		it("should retrieve more than one token from the end of a node's token stream with count option", () => {
			testGetLastTokensWithCountOption(store);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter option", () => {
			testGetLastTokensWithFilter(store);
		});

		it("should retrieve matched tokens from the end of a node's token stream with filter and count options", () => {
			testGetLastTokensWithFilterAndCount(store);
		});

		it("should retrieve all tokens from the end of a node's token stream with includeComments option", () => {
			testGetLastTokensWithIncludeComments(store);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count options", () => {
			testGetLastTokensWithIncludeCommentsAndCount(store);
		});

		it("should retrieve matched tokens from the end of a node's token stream with includeComments and count and filter options", () => {
			testGetLastTokensWithIncludeCommentsCountAndFilter(store);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			testGetLastTokensWhitespace(store);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			testGetLastTokensComment(store);
		});

		it("should retrieve the last token/comment from Program when it ends with a comment and whitespace", () => {
			testGetLastTokensCommentAndWhitespace(store);
		});
	});

	describe("when calling getLastToken", () => {
		it("should retrieve the last token of a node's token stream", () => {
			testGetLastToken(store);
		});

		it("should skip a given number of tokens", () => {
			testGetLastTokenSkip(store);
		});

		it("should skip a given number of tokens with skip option", () => {
			testGetLastTokenSkipOption(store);
		});

		it("should retrieve the last matched token of a node's token stream with filter option", () => {
			testGetLastTokenWithFilter(store);
		});

		it("should retrieve the last matched token of a node's token stream with filter and skip options", () => {
			testGetLastTokenWithFilterAndSkip(store);
		});

		it("should retrieve the last token of a node's token stream with includeComments option", () => {
			testGetLastTokenWithIncludeComments(store);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip options", () => {
			testGetLastTokenWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve the last token of a node's token stream with includeComments and skip and filter options", () => {
			testGetLastTokenWithIncludeCommentsSkipAndFilter(store);
		});

		it("should retrieve the last comment if the comment is at the last of nodes", () => {
			testGetLastTokenLastComment(store);
		});

		it("should retrieve the last token (without includeComments option) if the comment is at the last of nodes", () => {
			testGetLastTokenLastTokenWithoutIncludeComments(store);
		});

		it("should retrieve the last token if the root node contains a trailing comment", () => {
			testGetLastTokenWithTrailingComment(store);
		});

		it("should retrieve the last token from Program when it ends with whitespace", () => {
			testGetLastTokenWhitespace(store);
		});

		it("should retrieve the last token from Program when it ends with a comment", () => {
			testGetLastTokenComment(store);
		});

		it("should retrieve the last token from Program when it ends with a comment and whitespace", () => {
			testGetLastTokenCommentAndWhitespace(store);
		});

		it("should return null if the source contains only comments", () => {
			testGetLastTokenNullOnlyComments(store);
		});

		it("should return null if the source is empty", () => {
			testGetLastTokenNullEmptySource(store);
		});
	});

	describe("when calling getFirstTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetFirstTokensBetweenZero(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			testGetFirstTokensBetweenMultipleWithCount(store);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			testGetFirstTokensBetweenWithFilter(store);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			testGetFirstTokensBetweenAllWithEmptyObject(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments option", () => {
			testGetFirstTokensBetweenWithIncludeComments(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			testGetFirstTokensBetweenWithIncludeCommentsAndCount(store);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			testGetFirstTokensBetweenWithIncludeCommentsAndFilter(store);
		});
	});

	describe("when calling getFirstTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			testGetFirstTokenBetweenNull(store);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			testGetFirstTokenBetweenOne(store);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			testGetFirstTokenBetweenWithSkip(store);
		});

		it("should return null if it's skipped beyond the right token", () => {
			testGetFirstTokenBetweenNullBeyondRightToken(store);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			testGetFirstTokenBetweenWithFilter(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			testGetFirstTokenBetweenWithIncludeComments(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			testGetFirstTokenBetweenWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			testGetFirstTokenBetweenWithIncludeCommentsSkipAndFilter(store);
		});
	});

	describe("when calling getLastTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetLastTokensBetweenZero(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with count option", () => {
			testGetLastTokensBetweenMultipleWithCount(store);
		});

		it("should retrieve matched tokens between non-adjacent nodes with filter option", () => {
			testGetLastTokensBetweenWithFilter(store);
		});

		it("should retrieve all tokens between non-adjacent nodes with empty object option", () => {
			testGetLastTokensBetweenAllWithEmptyObject(store);
		});

		it("should retrieve all tokens and comments between non-adjacent nodes with includeComments option", () => {
			testGetLastTokensBetweenWithIncludeComments(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes with includeComments and count options", () => {
			testGetLastTokensBetweenWithIncludeCommentsAndCount(store);
		});

		it("should retrieve multiple tokens and comments between non-adjacent nodes with includeComments and filter options", () => {
			testGetLastTokensBetweenWithIncludeCommentsAndFilter(store);
		});
	});

	describe("when calling getLastTokenBetween", () => {
		it("should return null between adjacent nodes", () => {
			testGetLastTokenBetweenNull(store);
		});

		it("should retrieve one token between non-adjacent nodes with count option", () => {
			testGetLastTokenBetweenOne(store);
		});

		it("should retrieve one token between non-adjacent nodes with skip option", () => {
			testGetLastTokenBetweenWithSkip(store);
		});

		it("should return null if it's skipped beyond the right token", () => {
			testGetLastTokenBetweenNullBeyondRightToken(store);
		});

		it("should retrieve the first matched token between non-adjacent nodes with filter option", () => {
			testGetLastTokenBetweenWithFilter(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments option", () => {
			testGetLastTokenBetweenWithIncludeComments(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip options", () => {
			testGetLastTokenBetweenWithIncludeCommentsAndSkip(store);
		});

		it("should retrieve first token or comment between non-adjacent nodes with includeComments and skip and filter options", () => {
			testGetLastTokenBetweenWithIncludeCommentsSkipAndFilter(store);
		});
	});

	describe("when calling getTokensBetween", () => {
		it("should retrieve zero tokens between adjacent nodes", () => {
			testGetTokensBetweenZero(store);
		});

		it("should retrieve one token between nodes", () => {
			testGetTokensBetweenOne(store);
		});

		it("should retrieve multiple tokens between non-adjacent nodes", () => {
			testGetTokensBetweenMultiple(store);
		});

		it("should retrieve surrounding tokens when asked for padding", () => {
			testGetTokensBetweenWithPadding(store);
		});
	});

	describe("when calling getTokenByRangeStart", () => {
		it("should return identifier token", () => {
			testGetTokenByRangeStartIdentifier(store);
		});

		it("should return null when token doesn't exist", () => {
			testGetTokenByRangeStartNull(store);
		});

		it("should return a comment token when includeComments is true", () => {
			testGetTokenByRangeStartCommentTrue(store);
		});

		it("should not return a comment token at the supplied index when includeComments is false", () => {
			testGetTokenByRangeStartCommentFalse(store);
		});

		it("should not return comment tokens by default", () => {
			testGetTokenByRangeStartDefault(store);
		});
	});

	describe("when calling getFirstToken & getTokenAfter", () => {
		it("should retrieve all tokens and comments in the node", () => {
			testGetFirstTokenAndGetTokenAfter(store);
		});

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			testGetFirstTokenAndGetTokenAfterNoSpaces(store);
		});
	});

	describe("when calling getLastToken & getTokenBefore", () => {
		it("should retrieve all tokens and comments in the node", () => {
			testGetLastTokenAndGetTokenBefore(store);
		});

		it("should retrieve all tokens and comments in the node (no spaces)", () => {
			testGetLastTokenAndGetTokenBeforeNoSpaces(store);
		});
	});

	describe("when calling commentsExistBetween", () => {
		it("should retrieve false if comments don't exist", () => {
			testCommentsExistBetweenFalse(store);
		});

		it("should retrieve true if comments exist", () => {
			testCommentsExistBetweenTrue(store);
		});
	});

	describe("getCommentsBefore", () => {
		it("should retrieve comments before a node", () => {
			testGetCommentsBeforeNode(store);
		});

		it("should retrieve comments before a token", () => {
			testGetCommentsBeforeToken(store);
		});

		it("should retrieve multiple comments before a node", () => {
			testGetCommentsBeforeMultiple(store);
		});

		it("should return an empty array for a Program node", () => {
			testGetCommentsBeforeProgramNode(store);
		});

		it("should return an empty array if there are no comments before a node or token", () => {
			testGetCommentsBeforeEmptyArray(store);
		});

		it("should retrieve no comments before Program when it starts with whitespace and a comment", () => {
			testGetCommentsBeforeNoCommentsWhitespaceAndComment(store);
		});
	});

	describe("getCommentsAfter", () => {
		it("should retrieve comments after a node", () => {
			testGetCommentsAfterNode(store);
		});

		it("should retrieve comments after a token", () => {
			testGetCommentsAfterToken(store);
		});

		it("should retrieve multiple comments after a node", () => {
			testGetCommentsAfterMultiple(store);
		});

		it("should return an empty array for a Program node", () => {
			testGetCommentsAfterProgramNode(store);
		});

		it("should return an empty array if there are no comments after a node or token", () => {
			testGetCommentsAfterEmptyArray(store);
		});

		it("should retrieve no comments after Program when it ends with a comment and whitespace", () => {
			testGetCommentsAfterNoCommentsCommentAndWhitespace(store);
		});
	});

	describe("getCommentsInside", () => {
		it("should retrieve comments inside a node", () => {
			testGetCommentsInside(store);
		});

		it("should return an empty array if a node does not contain any comments", () => {
			testGetCommentsInsideEmptyArray(store);
		});
	});
});