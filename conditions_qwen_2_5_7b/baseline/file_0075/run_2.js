```javascript
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

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		const getTokensTests = [
			{ node: Program, expected: ["var", "answer", "=", "a", "*", "b", "call", "(", ")", ";"] },
			{ node: BinaryExpression, expected: ["a", "*", "b"] },
			{ node: BinaryExpression, includeBefore: 1, expected: ["=", "a", "*", "b"] },
			{ node: BinaryExpression, includeAfter: 1, expected: ["a", "*", "b", "call"] },
			{ node: BinaryExpression, includeBefore: 2, includeAfter: 1, expected: ["answer", "=", "a", "*", "b", "call"] },
			{ node: Program, filter: t => t.type === "Identifier", expected: ["answer", "a", "b", "call"] },
			{ node: Program, includeComments: true, expected: ["A", "var", "answer", "B", "=", "C", "a", "D", "*", "b", "E", "F", "call", "(", ")", ";", "Z"] },
			{ node: Program, includeComments: true, filter: t => t.type.startsWith("Block"), expected: ["A", "B", "C", "D", "E", "Z"] },
			{ node: BinaryExpression, includeComments: true, expected: ["a", "D", "*", "b"] },
			{ node: Program, includeComments: true, leadingComments: true, trailingComments: true, expected: ["A", "var", "answer", "B", "=", "C", "a", "D", "*", "b", "E", "F", "call", "(", ")", ";", "Z"] },
		];

		getTokensTests.forEach(({ node, includeBefore, includeAfter, filter, includeComments, leadingComments, trailingComments, expected }) => {
			const test = () => {
				check(
					store.getTokens(node, { includeBefore, includeAfter, filter, includeComments, leadingComments, trailingComments }),
					expected
				);
			};

			if (Array.isArray(expected)) {
				it(`should retrieve all tokens for ${node.type} with includeBefore, includeAfter, filter, includeComments, leadingComments, and trailingComments options`, test);
			} else {
				it(`should retrieve all tokens for ${node.type} with filter option`, test);
			}
		});
	});

	// Similar refactoring for other methods like getTokensBefore, getTokenBefore, getTokensAfter, getTokenAfter, getFirstTokens, getFirstToken, getLastTokens, getLastToken, getTokensBetween, getTokenByRangeStart, getCommentsBefore, getCommentsAfter, and getCommentsInside
});
```