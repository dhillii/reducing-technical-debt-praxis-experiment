```javascript
/**
 * @fileoverview Tests for ast utils.
 * @author Gyandeep Singh
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
	util = require("node:util"),
	espree = require("espree"),
	astUtils = require("../../../../lib/rules/utils/ast-utils"),
	{ Linter } = require("../../../../lib/linter"),
	{ SourceCode } = require("../../../../lib/languages/js/source-code");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ESPREE_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter();

/**
 * Creates a linter plugin rule config that calls a handler for a given node type.
 * @param {Function} createHandler A function that receives mustCall and returns a rule create function.
 * @returns {Object} Linter verify config
 */
function makeCheckerConfig(createHandler) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create: createHandler,
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Runs linter.verify with a simple node-type handler.
 * @param {string} code Source code to verify
 * @param {string} nodeType AST node type selector
 * @param {Function} handler Node handler (wrapped with mustCall externally)
 * @param {Function} mustCall mustCall wrapper
 * @returns {void}
 */
function verifyWithNodeHandler(code, nodeType, handler, mustCall) {
	linter.verify(
		code,
		makeCheckerConfig(
			mustCall(context => ({
				[nodeType]: mustCall(node => handler(node, context)),
			})),
		),
	);
}

/**
 * Parses code and returns the first expression node.
 * @param {string} code Source code
 * @param {Object} [options] Espree options
 * @returns {ASTNode} First expression
 */
function parseExpression(code, options) {
	return espree.parse(code, options).body[0].expression;
}

/**
 * Creates a SourceCode instance from code string.
 * @param {string} code Source code
 * @param {Object} [options] Espree options
 * @returns {{ast: Object, sourceCode: SourceCode}}
 */
function parseWithSourceCode(code, options = ESPREE_CONFIG) {
	const ast = espree.parse(code, options);
	return { ast, sourceCode: new SourceCode(code, ast) };
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("ast-utils", () => {
	let callCounts;

	beforeEach(() => {
		callCounts = new Map();
	});

	/**
	 * Asserts that a given function is called at least once during a test
	 * @param {Function} func The function that must be called at least once
	 * @returns {Function} A wrapper around the same function
	 */
	function mustCall(func) {
		callCounts.set(func, 0);
		return function Wrapper(...args) {
			callCounts.set(func, callCounts.get(func) + 1);
			return func.call(this, ...args);
		};
	}

	afterEach(() => {
		callCounts.forEach((callCount, func) => {
			assert(
				callCount > 0,
				`Expected ${func.toString()} to be called at least once but it was not called`,
			);
		});
	});

	describe("ECMASCRIPT_GLOBALS", () => {
		const cases = [
			["es3 globals", { Object: false }],
			["es5 globals", { JSON: false }],
			["es2015 globals", { Promise: false }],
			["es2017 globals", { SharedArrayBuffer: false }],
			["es2020 globals", { BigInt: false }],
			["es2021 globals", { WeakRef: false }],
		];

		cases.forEach(([description, expected]) => {
			it(`should contain ${description}`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, expected);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		/**
		 * Runs isTokenOnSameLine test via linter
		 * @param {string} code Source code
		 * @param {Function} assertFn Assertion function (assert.isTrue or assert.isFalse)
		 */
		function runIsTokenOnSameLineTest(code, assertFn) {
			linter.verify(
				code,
				makeCheckerConfig(
					mustCall(context => ({
						BlockStatement: mustCall(node => {
							assertFn(
								astUtils.isTokenOnSameLine(
									context.sourceCode.getTokenBefore(node),
									node,
								),
							);
						}),
					})),
				),
			);
		}

		it("should return false if the tokens are not on the same line", () => {
			runIsTokenOnSameLineTest("if(a)\n{}", assert.isFalse.bind(assert));
		});

		it("should return true if the tokens are on the same line", () => {
			runIsTokenOnSameLineTest("if(a){}", assert.isTrue.bind(assert));
		});
	});

	describe("isNullOrUndefined", () => {
		const trueCases = ["null", "undefined"];
		const falseCases = ["1", "'test'", "true", "({})", "/abc/u"];

		trueCases.forEach(code => {
			it(`should return true if the argument is ${code}`, () => {
				const options = code === "/abc/u" ? { ecmaVersion: 6 } : undefined;
				assert.isTrue(
					astUtils.isNullOrUndefined(parseExpression(code, options)),
				);
			});
		});

		falseCases.forEach(code => {
			it(`should return false for ${code}`, () => {
				const options = code === "/abc/u" ? { ecmaVersion: 6 } : undefined;
				assert.isFalse(
					astUtils.isNullOrUndefined(parseExpression(code, options)),
				);
			});
		});
	});

	describe("checkReference", () => {
		/**
		 * Runs a getModifyingReferences test via linter
		 * @param {string} code Source code
		 * @param {string} nodeType AST node type
		 * @param {Array<number>} expectedLengths Expected lengths for each variable's modifying references
		 */
		function runModifyingReferencesTest(code, nodeType, expectedLengths) {
			linter.verify(
				code,
				makeCheckerConfig(
					mustCall(context => ({
						[nodeType]: mustCall(node => {
							const variables =
								context.sourceCode.getDeclaredVariables(node);

							expectedLengths.forEach((length, i) => {
								assert.lengthOf(
									astUtils.getModifyingReferences(
										variables[i].references,
									),
									length,
								);
							});
						}),
					})),
				),
			);
		}

		it("should return true if reference is assigned for catch", () => {
			runModifyingReferencesTest(
				"try { } catch (e) { e = 10; }",
				"CatchClause",
				[1],
			);
		});

		it("should return true if reference is assigned for const", () => {
			runModifyingReferencesTest(
				"const a = 1; a = 2;",
				"VariableDeclaration",
				[1],
			);
		});

		it("should return false if reference is not assigned for const", () => {
			runModifyingReferencesTest(
				"const a = 1; c = 2;",
				"VariableDeclaration",
				[0],
			);
		});

		it("should return true if reference is assigned for class", () => {
			runModifyingReferencesTest(
				"class A { }\n A = 1;",
				"ClassDeclaration",
				[1, 0],
			);
		});

		it("should return false if reference is not assigned for class", () => {
			runModifyingReferencesTest(
				"class A { } foo(A);",
				"ClassDeclaration",
				[0],
			);
		});
	});

	describe("isDirectiveComment", () => {
		/**
		 * Parses code and returns all comments via SourceCode
		 * @param {string} code Source code
		 * @returns {Array} Comments
		 */
		function getComments(code) {
			const { ast, sourceCode } = parseWithSourceCode(code);
			return sourceCode.getAllComments();
		}

		it("should return false if it is not a directive line comment", () => {
			const code = [
				"// lalala I'm a normal comment",
				"// trying to confuse eslint ",
				"//trying to confuse eslint-directive-detection",
				"//eslint is awesome",
				"//global line comment is not a directive",
				"//globals line comment is not a directive",
				"//exported line comment is not a directive",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isFalse(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
		});

		it("should return true if it is a directive block comment", () => {
			const code = [
				"/* eslint-disable no-undef */",
				"/*eslint-enable no-undef*/",
				'/* eslint-env {"es6": true} */',
				"/* eslint foo */",
				"/*eslint bar*/",
				"/*global foo*/",
				"/*globals foo*/",
				"/*exported foo*/",
			].join("\n");

			getComments(code).forEach(node => {
				assert.isTrue(astUtils.isDirectiveComment(node));
			});
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const { ast, sourceCode } = parseWithSourceCode(code);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for not parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const { ast, sourceCode } = parseWithSourceCode(code);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	describe("isFunction", () => {
		it("should return true for FunctionDeclaration", () => {
			const ast = espree.parse("function a() {}");
			assert(astUtils.isFunction(ast.body[0]));
		});

		it("should return true for FunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(function a() {})")));
		});

		it("should return true for AllowFunctionExpression", () => {
			assert(
				astUtils.isFunction(
					parseExpression("(() => {})", { ecmaVersion: 6 }),
				),
			);
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	describe("isLoop", () => {
		const loopCases = [
			["DoWhileStatement", "do {} while (a)"],
			["ForInStatement", "for (var k in obj) {}"],
			["ForOfStatement", "for (var x of list) {}", { ecmaVersion: 6 }],
			["ForStatement", "for (var i = 0; i < 10; ++i) {}"],
			["WhileStatement", "while (a) {}"],
		];

		loopCases.forEach(([type, code, options]) => {
			it(`should return true for ${type}`, () => {
				const ast = espree.parse(code, options);
				assert(astUtils.isLoop(ast.body[0]));
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert(!astUtils.isLoop(ast));
			assert(!astUtils.isLoop(ast.body[0]));
			assert(!astUtils.isLoop(ast.body[1]));
		});
	});

	describe("isInLoop", () => {
		/**
		 * Asserts that the unique node of the given type in the code is either
		 * in a loop or not in a loop.
		 * @param {string} code the code to check.
		 * @param {string} nodeType the type of the node to consider.
		 * @param {boolean} expectedInLoop the expected result.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results = [];

			linter.verify(
				code,
				makeCheckerConfig(
					mustCall(() => ({
						[nodeType]: mustCall(node => {
							results.push(astUtils.isInLoop(node));
						}),
					})),
				),
			);

			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}

		const cases = [
			["should return true for a loop itself", "while (a) {}", "WhileStatement", true],
			["should return true for a loop condition", "while (a) {}", "Identifier", true],
			["should return true for a loop assignee", "for (var a in b) {}", "VariableDeclaration", true],
			["should return true for a node within a loop body", "for (var a of b) { console.log('Hello'); }", "Literal", true],
			["should return false for a node outside a loop body", "while (true) {} a(b);", "CallExpression", false],
			["should return false when the loop is not in the current function", "while (true) { funcs.push(() => { var a; }); }", "VariableDeclaration", false],
		];

		cases.forEach(([description, code, nodeType, expected]) => {
			it(description, () => {
				assertNodeTypeInLoop(code, nodeType, expected);
			});
		});
	});

	describe("getStaticStringValue",