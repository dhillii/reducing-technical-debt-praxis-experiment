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
 * Creates a linter plugin rule config that calls mustCall on create and the given node visitor.
 * @param {Function} mustCall wrapper
 * @param {string} nodeType AST node type selector
 * @param {Function} visitor node visitor function
 * @returns {Object} plugin config
 */
function makeCheckerPlugin(mustCall, nodeType, visitor) {
	return {
		test: {
			rules: {
				checker: {
					create: mustCall(() => ({
						[nodeType]: mustCall(visitor),
					})),
				},
			},
		},
	};
}

/**
 * Runs linter.verify with a single-rule checker plugin.
 * @param {string} code source code
 * @param {Function} mustCall wrapper
 * @param {string} nodeType AST node type selector
 * @param {Function} visitor node visitor function
 * @returns {Array} linter messages
 */
function verifyWithChecker(code, mustCall, nodeType, visitor) {
	return linter.verify(code, {
		plugins: makeCheckerPlugin(mustCall, nodeType, visitor),
		rules: { "test/checker": "error" },
	});
}

/**
 * Parses code and returns the first expression node.
 * @param {string} code source code
 * @param {Object} [options] espree options
 * @returns {ASTNode} expression node
 */
function parseExpression(code, options) {
	return espree.parse(code, options).body[0].expression;
}

/**
 * Creates a SourceCode instance from code string.
 * @param {string} code source code
 * @param {Object} [config] espree config
 * @returns {SourceCode} source code instance
 */
function createSourceCode(code, config = ESPREE_CONFIG) {
	const ast = espree.parse(code, config);
	return new SourceCode(code, ast);
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
		const globals = [
			["es3", { Object: false }],
			["es5", { JSON: false }],
			["es2015", { Promise: false }],
			["es2017", { SharedArrayBuffer: false }],
			["es2020", { BigInt: false }],
			["es2021", { WeakRef: false }],
		];

		globals.forEach(([version, expected]) => {
			it(`should contain ${version} globals`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, expected);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		function runIsTokenOnSameLineTest(code, expectedResult) {
			verifyWithChecker(code, mustCall, "BlockStatement", mustCall(node => {
				const tokenBefore = linter.getSourceCode().getTokenBefore(node);
				assert[expectedResult ? "isTrue" : "isFalse"](
					astUtils.isTokenOnSameLine(tokenBefore, node),
				);
			}));
		}

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
												context.sourceCode.getTokenBefore(node),
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
												context.sourceCode.getTokenBefore(node),
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
		const cases = [
			["null", true],
			["undefined", true],
			["1", false],
			["'test'", false],
			["true", false],
			["({})", false],
		];

		cases.forEach(([code, expected]) => {
			it(`should return ${expected} if the argument is ${code}`, () => {
				assert[expected ? "isTrue" : "isFalse"](
					astUtils.isNullOrUndefined(parseExpression(code)),
				);
			});
		});

		it("should return false if the argument is a unicode regex", () => {
			assert.isFalse(
				astUtils.isNullOrUndefined(
					parseExpression("/abc/u", { ecmaVersion: 6 }),
				),
			);
		});
	});

	describe("checkReference", () => {
		/**
		 * Creates a linter plugin that checks modifying references count.
		 * @param {Function} mustCallFn mustCall wrapper
		 * @param {string} nodeType AST node type
		 * @param {number} varIndex variable index
		 * @param {number} expectedLength expected references length
		 * @returns {Object} plugin config
		 */
		function makeReferenceChecker(mustCallFn, nodeType, varIndex, expectedLength) {
			return {
				test: {
					rules: {
						checker: {
							create: mustCallFn(context => ({
								[nodeType]: mustCallFn(node => {
									const variables = context.sourceCode.getDeclaredVariables(node);
									assert.lengthOf(
										astUtils.getModifyingReferences(variables[varIndex].references),
										expectedLength,
									);
								}),
							})),
						},
					},
				},
			};
		}

		it("should return true if reference is assigned for catch", () => {
			linter.verify("try { } catch (e) { e = 10; }", {
				plugins: makeReferenceChecker(mustCall, "CatchClause", 0, 1),
				rules: { "test/checker": "error" },
			});
		});

		it("should return true if reference is assigned for const", () => {
			linter.verify("const a = 1; a = 2;", {
				plugins: makeReferenceChecker(mustCall, "VariableDeclaration", 0, 1),
				rules: { "test/checker": "error" },
			});
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify("const a = 1; c = 2;", {
				plugins: makeReferenceChecker(mustCall, "VariableDeclaration", 0, 0),
				rules: { "test/checker": "error" },
			});
		});

		it("should return true if reference is assigned for class", () => {
			linter.verify("class A { }\n A = 1;", {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(context => ({
									ClassDeclaration: mustCall(node => {
										const variables = context.sourceCode.getDeclaredVariables(node);
										assert.lengthOf(
											astUtils.getModifyingReferences(variables[0].references),
											1,
										);
										assert.lengthOf(
											astUtils.getModifyingReferences(variables[1].references),
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
				plugins: makeReferenceChecker(mustCall, "ClassDeclaration", 0, 0),
				rules: { "test/checker": "error" },
			});
		});
	});

	describe("isDirectiveComment", () => {
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

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
			createSourceCode(code).getAllComments().forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");
			createSourceCode(code).getAllComments().forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");
			createSourceCode(code).getAllComments().forEach(assertTrue);
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
			createSourceCode(code).getAllComments().forEach(assertTrue);
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isFalse(astUtils.isParenthesised(sourceCode, ast.body[0].expression));
		});

		it("should return true for not parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isTrue(astUtils.isParenthesised(sourceCode, ast.body[0].expression));
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
			assert(astUtils.isFunction(parseExpression("(() => {})", { ecmaVersion: 6 })));
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
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
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

		const cases = [
			["should return true for a loop itself", "while (a) {}", "WhileStatement", true],
			["should return true for a loop condition", "while (a) {}", "Identifier", true],
			["should return true for a loop assignee", "for (