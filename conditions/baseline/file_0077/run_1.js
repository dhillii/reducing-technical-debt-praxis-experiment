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
// Tests
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
 * Asserts that the unique node of the given type in the code is either
 * in a loop or not in a loop.
 * @param {string} code the code to check.
 * @param {string} nodeType the type of the node to consider. The code
 *      must have exactly one node of this type.
 * @param {boolean} expectedInLoop the expected result for whether the
 *      node is in a loop.
 * @param {Function} mustCall function to wrap callbacks
 * @returns {void}
 */
function assertNodeTypeInLoop(code, nodeType, expectedInLoop, mustCall) {
	const results = [];

	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create: mustCall(() => ({
							[nodeType]: mustCall(node => {
								results.push(astUtils.isInLoop(node));
							}),
						})),
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	});

	assert.lengthOf(results, 1);
	assert.strictEqual(results[0], expectedInLoop);
}

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
		it("should contain es3 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { Object: false });
		});

		it("should contain es5 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { JSON: false });
		});

		it("should contain es2015 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { Promise: false });
		});

		it("should contain es2017 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, {
				SharedArrayBuffer: false,
			});
		});

		it("should contain es2020 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { BigInt: false });
		});

		it("should contain es2021 globals", () => {
			assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, { WeakRef: false });
		});
	});

	describe("isTokenOnSameLine", () => {
		it("should return false if the tokens are not on the same line", () => {
			linter.verify("if(a)\n{}", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									BlockStatement: mustCall(node => {
										assert.isFalse(
											astUtils.isTokenOnSameLine(
												context.sourceCode.getTokenBefore(
													node,
												),
												node,
											),
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});

		it("should return true if the tokens are on the same line", () => {
			linter.verify("if(a){}", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									BlockStatement: mustCall(node => {
										assert.isTrue(
											astUtils.isTokenOnSameLine(
												context.sourceCode.getTokenBefore(
													node,
												),
												node,
											),
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});
	});

	describe("isNullOrUndefined", () => {
		it("should return true if the argument is null", () => {
			assert.isTrue(
				astUtils.isNullOrUndefined(
					espree.parse("null").body[0].expression,
				),
			);
		});

		it("should return true if the argument is undefined", () => {
			assert.isTrue(
				astUtils.isNullOrUndefined(
					espree.parse("undefined").body[0].expression,
				),
			);
		});

		it("should return false if the argument is a number", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					espree.parse("1").body[0].expression,
				),
			);
		});

		it("should return false if the argument is a string", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					espree.parse("'test'").body[0].expression,
				),
			);
		});

		it("should return false if the argument is a boolean", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					espree.parse("true").body[0].expression,
				),
			);
		});

		it("should return false if the argument is an object", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					espree.parse("({})").body[0].expression,
				),
			);
		});

		it("should return false if the argument is a unicode regex", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					espree.parse("/abc/u", { ecmaVersion: 6 }).body[0]
						.expression,
				),
			);
		});
	});

	describe("checkReference", () => {
		// catch
		it("should return true if reference is assigned for catch", () => {
			linter.verify("try { } catch (e) { e = 10; }", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									CatchClause: mustCall(node => {
										const variables =
											context.sourceCode.getDeclaredVariables(
												node,
											);

										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[0].references,
											),
											1,
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});

		// const
		it("should return true if reference is assigned for const", () => {
			linter.verify("const a = 1; a = 2;", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									VariableDeclaration: mustCall(node => {
										const variables =
											context.sourceCode.getDeclaredVariables(
												node,
											);

										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[0].references,
											),
											1,
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify("const a = 1; c = 2;", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									VariableDeclaration: mustCall(node => {
										const variables =
											context.sourceCode.getDeclaredVariables(
												node,
											);

										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[0].references,
											),
											0,
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});

		// class
		it("should return true if reference is assigned for class", () => {
			linter.verify("class A { }\n A = 1;", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									ClassDeclaration: mustCall(node => {
										const variables =
											context.sourceCode.getDeclaredVariables(
												node,
											);

										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[0].references,
											),
											1,
										);
										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[1].references,
											),
											0,
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});

		it("should return false if reference is not assigned for class", () => {
			linter.verify("class A { } foo(A);", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									ClassDeclaration: mustCall(node => {
										const variables =
											context.sourceCode.getDeclaredVariables(
												node,
											);

										assert.lengthOf(
											astUtils.getModifyingReferences(
												variables[0].references,
											),
											0,
										);
									}),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		});
	});

	describe("isDirectiveComment", () => {
		/**
		 * Asserts the node is NOT a directive comment
		 * @param {ASTNode} node node to assert
		 * @returns {void}
		 */
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		/**
		 * Asserts the node is a directive comment
		 * @param {ASTNode} node node to assert
		 * @returns {void}
		 */
		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
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
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertTrue);
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
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);
			const comments = sourceCode.getAllComments();

			comments.forEach(assertTrue);
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for not parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	describe("isFunction", () => {
		it("should return true for FunctionDeclaration", () => {
			const ast = espree.parse("function a() {}");
			const node = ast.body[0];

			assert(astUtils.isFunction(node));
		});

		it("should return true for FunctionExpression", () => {
			const ast = espree.parse("(function a() {})");
			const node = ast.body[0].expression;

			assert(astUtils.isFunction(node));
		});

		it("should return true for AllowFunctionExpression", () => {
			const ast = espree.parse("(() => {})", { ecmaVersion: 6 });
			const node = ast.body[0].expression;

			assert(astUtils.isFunction(node));
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert(!astUtils.isFunction(ast));