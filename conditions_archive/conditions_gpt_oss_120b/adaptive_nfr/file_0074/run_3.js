/**
 * @fileoverview Abstraction of JavaScript source code.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const fs = require("node:fs"),
	path = require("node:path"),
	assert = require("chai").assert,
	espree = require("espree"),
	eslintScope = require("eslint-scope"),
	sinon = require("sinon"),
	{ Linter } = require("../../../../../lib/linter"),
	SourceCode = require("../../../../../lib/languages/js/source-code/source-code"),
	astUtils = require("../../../../../lib/shared/ast-utils"),
	globals = require("../../../../../conf/globals");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter({ configType: "flat" });
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG),
	TEST_CODE = "var answer = 6 * 7;",
	SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Run space‑between tests for token pairs.
 * @param {Array<Array<string|boolean>>} cases Test cases.
 * @param {string} description Description prefix.
 */
function runTokenSpaceTests(cases, description) {
	cases.forEach(([code, expected]) => {
		describe(`when the first given is located before the second (${description})`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.tokens[0],
						sourceCode.ast.tokens.at(-1),
					),
					expected,
				);
			});
		});

		describe(`when the first given is located after the second (${description})`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.tokens.at(-1),
						sourceCode.ast.tokens[0],
					),
					expected,
				);
			});
		});
	});
}

/**
 * Run space‑between tests for token‑node pairs.
 * @param {Array<Array<string|boolean>>} cases Test cases.
 */
function runTokenNodeSpaceTests(cases) {
	cases.forEach(([code, expected]) => {
		describe(`when the first given is located before the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.tokens[0],
						sourceCode.ast.body.at(-1),
					),
					expected,
				);
			});
		});

		describe(`when the first given is located after the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.body.at(-1),
						sourceCode.ast.tokens[0],
					),
					expected,
				);
			});
		});
	});
}

/**
 * Run space‑between tests for node‑token pairs.
 * @param {Array<Array<string|boolean>>} cases Test cases.
 */
function runNodeTokenSpaceTests(cases) {
	cases.forEach(([code, expected]) => {
		describe(`when the first given is located before the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.body[0],
						sourceCode.ast.tokens.at(-1),
					),
					expected,
				);
			});
		});

		describe(`when the first given is located after the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.tokens.at(-1),
						sourceCode.ast.body[0],
					),
					expected,
				);
			});
		});
	});
}

/**
 * Run space‑between tests for node‑node pairs.
 * @param {Array<Array<string|boolean>>} cases Test cases.
 */
function runNodeNodeSpaceTests(cases) {
	cases.forEach(([code, expected]) => {
		describe(`when the first given is located before the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.body[0],
						sourceCode.ast.body.at(-1),
					),
					expected,
				);
			});
		});

		describe(`when the first given is located after the second`, () => {
			it(code, () => {
				const ast = espree.parse(code, DEFAULT_CONFIG),
					sourceCode = new SourceCode(code, ast);

				assert.strictEqual(
					sourceCode.isSpaceBetween(
						sourceCode.ast.body.at(-1),
						sourceCode.ast.body[0],
					),
					expected,
				);
			});
		});
	});
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	// ... (all other test suites remain unchanged)

	describe("isSpaceBetween()", () => {
		describe("should return true when there is at least one whitespace character between two tokens", () => {
			const tokenTests = [
				["let foo", true],
				["let  foo", true],
				["let /**/ foo", true],
				["let/**/foo", false],
				["let/*\n*/foo", false],
			];
			runTokenSpaceTests(tokenTests, "token‑token");
		});

		describe("should return true when there is at least one whitespace character between a token and a node", () => {
			const tokenNodeTests = [
				[";let foo = bar", false],
				[";/**/let foo = bar", false],
				[";/* */let foo = bar", false],
				["; let foo = bar", true],
				["; let foo = bar", true],
				["; /**/let foo = bar", true],
				["; /* */let foo = bar", true],
				[";/**/ let foo = bar", true],
				[";/* */ let foo = bar", true],
				["; /**/ let foo = bar", true],
				["; /* */ let foo = bar", true],
				[";\tlet foo = bar", true],
				[";\tlet foo = bar", true],
				[";\t/**/let foo = bar", true],
				[";\t/* */let foo = bar", true],
				[";/**/\tlet foo = bar", true],
				[";/* */\tlet foo = bar", true],
				[";\t/**/\tlet foo = bar", true],
				[";\t/* */\tlet foo = bar", true],
				[";\nlet foo = bar", true],
				[";\nlet foo = bar", true],
				[";\n/**/let foo = bar", true],
				[";\n/* */let foo = bar", true],
				[";/**/\nlet foo = bar", true],
				[";/* */\nlet foo = bar", true],
				[";\n/**/\nlet foo = bar", true],
				[";\n/* */\nlet foo = bar", true],
			];
			runTokenNodeSpaceTests(tokenNodeTests);
		});

		describe("should return true when there is at least one whitespace character between a node and a token", () => {
			const nodeTokenTests = [
				["let foo = bar;;", false],
				["let foo = bar;;;", false],
				["let foo = 1; let bar = 2;;", true],
				["let foo = bar;/**/;", false],
				["let foo = bar;/* */;", false],
				["let foo = bar;;;", false],
				["let foo = bar; ;", true],
				["let foo = bar; /**/;", true],
				["let foo = bar; /* */;", true],
				["let foo = bar;/**/ ;", true],
				["let foo = bar;/* */ ;", true],
				["let foo = bar; /**/ ;", true],
				["let foo = bar; /* */ ;", true],
				["let foo = bar;\t;", true],
				["let foo = bar;\t/**/;", true],
				["let foo = bar;\t/* */;", true],
				["let foo = bar;/**/\t;", true],
				["let foo = bar;/* */\t;", true],
				["let foo = bar;\t/**/\t;", true],
				["let foo = bar;\t/* */\t;", true],
				["let foo = bar;\n;", true],
				["let foo = bar;\n/**/;", true],
				["let foo = bar;\n/* */;", true],
				["let foo = bar;/**/\n;", true],
				["let foo = bar;/* */\n;", true],
				["let foo = bar;\n/**/\n;", true],
				["let foo = bar;\n/* */\n;", true],
			];
			runNodeTokenSpaceTests(nodeTokenTests);
		});

		describe("should return true when there is at least one whitespace character between two nodes", () => {
			const nodeNodeTests = [
				["let foo = bar;let baz = qux;", false],
				["let foo = bar;/**/let baz = qux;", false],
				["let foo = bar;/* */let baz = qux;", false],
				["let foo = bar; let baz = qux;", true],
				["let foo = bar; /**/let baz = qux;", true],
				["let foo = bar; /* */let baz = qux;", true],
				["let foo = bar;/**/ let baz = qux;", true],
				["let foo = bar;/* */ let baz = qux;", true],
				["let foo = bar; /**/ let baz = qux;", true],
				["let foo = bar; /* */ let baz = qux;", true],
				["let foo = bar;\tlet baz = qux;", true],
				["let foo = bar;\t/**/let baz = qux;", true],
				["let foo = bar;\t/* */let baz = qux;", true],
				["let foo = bar;/**/\tlet baz = qux;", true],
				["let foo = bar;/* */\tlet baz = qux;", true],
				["let foo = bar;\t/**/\tlet baz = qux;", true],
				["let foo = bar;\t/* */\tlet baz = qux;", true],
				["let foo = bar;\nlet baz = qux;", true],
				["let foo = bar;\n/**/let baz = qux;", true],
				["let foo = bar;\n/* */let baz = qux;", true],
				["let foo = bar;/**/\nlet baz = qux;", true],
				["let foo = bar;/* */\nlet baz = qux;", true],
				["let foo = bar;\n/**/\nlet baz = qux;", true],
				["let foo = bar;\n/* */\nlet baz = qux;", true],
				["let foo = 1;let foo2 = 2; let foo3 = 3;", true],
			];
			runNodeNodeSpaceTests(nodeNodeTests);
		});

		it("JSXText tokens that contain only whitespaces should NOT be handled as space", () => {
			const code = "let jsx = <div>\n   {content}\n</div>";
			const ast = espree.parse(code, {
				...DEFAULT_CONFIG,
				ecmaFeatures: { jsx: true },
			});
			const sourceCode = new SourceCode(code, ast);
			const jsx = ast.body[0].declarations[0].init;
			const interpolation = jsx.children[1];

			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.openingElement,
					interpolation,
				),
				false,
			);
			assert.strictEqual(
				sourceCode.isSpaceBetween(
					interpolation,
					jsx.closingElement,
				),
				false,
			);

			// Reversed order
			assert.strictEqual(
				sourceCode.isSpaceBetween(
					interpolation,
					jsx.openingElement,
				),
				false,
			);
			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.closingElement,
					interpolation,
				),
				false,
			);
		});

		it("JSXText tokens that contain both letters and whitespaces should NOT be handled as space", () => {
			const code = "let jsx = <div>\n   Hello\n</div>";
			const ast = espree.parse(code, {
				...DEFAULT_CONFIG,
				ecmaFeatures: { jsx: true },
			});
			const sourceCode = new SourceCode(code, ast);
			const jsx = ast.body[0].declarations[0].init;

			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.openingElement,
					jsx.closingElement,
				),
				false,
			);

			// Reversed order
			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.closingElement,
					jsx.openingElement,
				),
				false,
			);
		});

		it("JSXText tokens that contain only letters should NOT be handled as space", () => {
			const code = "let jsx = <div>Hello</div>";
			const ast = espree.parse(code, {
				...DEFAULT_CONFIG,
				ecmaFeatures: { jsx: true },
			});
			const sourceCode = new SourceCode(code, ast);
			const jsx = ast.body[0].declarations[0].init;

			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.openingElement,
					jsx.closingElement,
				),
				false,
			);

			// Reversed order
			assert.strictEqual(
				sourceCode.isSpaceBetween(
					jsx.closingElement,
					jsx.openingElement,
				),
				false,
			);
		});

		describe("should return false either of the arguments' location is inside the other one", () => {
			[["let foo = bar;", false]].forEach(([code, expected]) => {
				it(code, () => {
					const ast = espree.parse(code, DEFAULT_CONFIG),
						sourceCode = new SourceCode(code, ast);

					assert.strictEqual(
						sourceCode.isSpaceBetween(
							sourceCode.ast.tokens[0],
							sourceCode.ast.body[0],
						),
						expected,
					);

					assert.strictEqual(
						sourceCode.isSpaceBetween(
							sourceCode.ast.tokens.at(-1),
							sourceCode.ast.body[0],
						),
						expected,
					);

					assert.strictEqual(
						sourceCode.isSpaceBetween(
							sourceCode.ast.body[0],
							sourceCode.ast.tokens[0],
						),
						expected,
					);

					assert.strictEqual(
						sourceCode.isSpaceBetween(
							sourceCode.ast.body[0],
							sourceCode.ast.tokens.at(-1),
						),
						expected,
					);
				});
			});
		});
	});

	// ... (remaining test suites remain unchanged)
});