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
 * Creates a linter plugin rule config with a single checker rule.
 * @param {Function} createFn The rule's create function
 * @returns {Object} Linter verify config
 */
function makeCheckerConfig(createFn) {
	return {
		plugins: {
			test: {
				rules: {
					checker: { create: createFn },
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Parses code and returns the first expression node.
 * @param {string} code The code to parse
 * @param {Object} [options] Espree options
 * @returns {ASTNode} The first expression node
 */
function parseExpression(code, options) {
	return espree.parse(code, options).body[0].expression;
}

/**
 * Creates a SourceCode instance from code string.
 * @param {string} code The source code
 * @param {Object} [config] Espree config
 * @returns {SourceCode} The source code instance
 */
function makeSourceCode(code, config = ESPREE_CONFIG) {
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

	//------------------------------------------------------------------------------
	// ECMASCRIPT_GLOBALS
	//------------------------------------------------------------------------------

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

	//------------------------------------------------------------------------------
	// isTokenOnSameLine
	//------------------------------------------------------------------------------

	describe("isTokenOnSameLine", () => {
		/**
		 * Creates a checker that tests isTokenOnSameLine for a BlockStatement node.
		 * @param {Function} assertFn Assertion function (assert.isTrue or assert.isFalse)
		 * @param {Function} mustCallFn mustCall wrapper
		 * @returns {Object} Linter config
		 */
		function makeTokenOnSameLineConfig(assertFn, mustCallFn) {
			return makeCheckerConfig(
				mustCallFn(context => ({
					BlockStatement: mustCallFn(node => {
						assertFn(
							astUtils.isTokenOnSameLine(
								context.sourceCode.getTokenBefore(node),
								node,
							),
						);
					}),
				})),
			);
		}

		it("should return false if the tokens are not on the same line", () => {
			linter.verify(
				"if(a)\n{}",
				makeTokenOnSameLineConfig(assert.isFalse.bind(assert), mustCall),
			);
		});

		it("should return true if the tokens are on the same line", () => {
			linter.verify(
				"if(a){}",
				makeTokenOnSameLineConfig(assert.isTrue.bind(assert), mustCall),
			);
		});
	});

	//------------------------------------------------------------------------------
	// isNullOrUndefined
	//------------------------------------------------------------------------------

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
				assert.strictEqual(
					astUtils.isNullOrUndefined(parseExpression(code)),
					expected,
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

	//------------------------------------------------------------------------------
	// checkReference / getModifyingReferences
	//------------------------------------------------------------------------------

	describe("checkReference", () => {
		/**
		 * Creates a linter config that checks getModifyingReferences for a given node type.
		 * @param {string} nodeType AST node type to listen for
		 * @param {Function} assertFn Assertion callback receiving variables array
		 * @returns {Object} Linter config
		 */
		function makeReferenceCheckerConfig(nodeType, assertFn) {
			return makeCheckerConfig(
				mustCall(context => ({
					[nodeType]: mustCall(node => {
						const variables = context.sourceCode.getDeclaredVariables(node);
						assertFn(variables);
					}),
				})),
			);
		}

		it("should return true if reference is assigned for catch", () => {
			linter.verify(
				"try { } catch (e) { e = 10; }",
				makeReferenceCheckerConfig("CatchClause", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[0].references),
						1,
					);
				}),
			);
		});

		it("should return true if reference is assigned for const", () => {
			linter.verify(
				"const a = 1; a = 2;",
				makeReferenceCheckerConfig("VariableDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[0].references),
						1,
					);
				}),
			);
		});

		it("should return false if reference is not assigned for const", () => {
			linter.verify(
				"const a = 1; c = 2;",
				makeReferenceCheckerConfig("VariableDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[0].references),
						0,
					);
				}),
			);
		});

		it("should return true if reference is assigned for class", () => {
			linter.verify(
				"class A { }\n A = 1;",
				makeReferenceCheckerConfig("ClassDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[0].references),
						1,
					);
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[1].references),
						0,
					);
				}),
			);
		});

		it("should return false if reference is not assigned for class", () => {
			linter.verify(
				"class A { } foo(A);",
				makeReferenceCheckerConfig("ClassDeclaration", variables => {
					assert.lengthOf(
						astUtils.getModifyingReferences(variables[0].references),
						0,
					);
				}),
			);
		});
	});

	//------------------------------------------------------------------------------
	// isDirectiveComment
	//------------------------------------------------------------------------------

	describe("isDirectiveComment", () => {
		/**
		 * Parses code and returns all comments via SourceCode.
		 * @param {string} code The code to parse
		 * @returns {Array} Array of comment nodes
		 */
		function getComments(code) {
			return makeSourceCode(code).getAllComments();
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

	//------------------------------------------------------------------------------
	// isParenthesised
	//------------------------------------------------------------------------------

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const ast = espree.parse(code, ESPREE_CONFIG);
			const sourceCode = new SourceCode(code, ast);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	//------------------------------------------------------------------------------
	// isFunction
	//------------------------------------------------------------------------------

	describe("isFunction", () => {
		it("should return true for FunctionDeclaration", () => {
			const ast = espree.parse("function a() {}");

			assert(astUtils.isFunction(ast.body[0]));
		});

		it("should return true for FunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(function a() {})")));
		});

		it("should return true for ArrowFunctionExpression", () => {
			assert(astUtils.isFunction(parseExpression("(() => {})", { ecmaVersion: 6 })));
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");

			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	//------------------------------------------------------------------------------
	// isLoop
	//------------------------------------------------------------------------------

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

	//------------------------------------------------------------------------------
	// isInLoop
	//------------------------------------------------------------------------------

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
			["should return true for a