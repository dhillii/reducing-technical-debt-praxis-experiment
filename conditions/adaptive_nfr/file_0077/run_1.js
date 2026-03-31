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
 * Creates a linter plugin rule config that calls mustCall on the given visitor handlers.
 * @param {Function} mustCall wrapper factory
 * @param {Function} createVisitor function receiving context and returning visitor
 * @returns {Object} plugin config object
 */
function makeCheckerPlugin(mustCall, createVisitor) {
	return {
		plugins: {
			test: {
				rules: {
					checker: {
						create: mustCall(createVisitor),
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Runs linter.verify with a simple checker plugin.
 * @param {string} code source code
 * @param {Function} mustCall wrapper factory
 * @param {Function} createVisitor function receiving context and returning visitor
 * @returns {Array} linter messages
 */
function verifyWithChecker(code, mustCall, createVisitor) {
	return linter.verify(code, makeCheckerPlugin(mustCall, createVisitor));
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
 * @returns {{ast: Object, sourceCode: SourceCode}}
 */
function parseWithSourceCode(code, config = ESPREE_CONFIG) {
	const ast = espree.parse(code, config);
	return { ast, sourceCode: new SourceCode(code, ast) };
}

/**
 * Generates token predicate tests for a given token utility function pair.
 * @param {string} funcName name of the positive predicate
 * @param {string} negFuncName name of the negative predicate (or null)
 * @param {Array} tokens token array
 * @param {Array} expected boolean array
 */
function describeTokenPredicate(funcName, negFuncName, tokens, expected) {
	describe(funcName, () => {
		tokens.forEach((token, index) => {
			it(`should return ${expected[index]} for '${token.value}'.`, () => {
				assert.strictEqual(astUtils[funcName](token), expected[index]);
			});
		});
	});

	if (negFuncName) {
		describe(negFuncName, () => {
			tokens.forEach((token, index) => {
				it(`should return ${!expected[index]} for '${token.value}'.`, () => {
					assert.strictEqual(astUtils[negFuncName](token), !expected[index]);
				});
			});
		});
	}
}

/**
 * Parses tokens from code.
 * @param {string} code source code
 * @returns {Array} tokens
 */
function parseTokens(code) {
	return espree.parse(code, { ecmaVersion: 6, tokens: true }).tokens;
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

		cases.forEach(([desc, expected]) => {
			it(`should contain ${desc}`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, expected);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		function makeTokenOnSameLineChecker(mustCallFn, expectedResult) {
			return mustCallFn(context => ({
				BlockStatement: mustCallFn(node => {
					const result = astUtils.isTokenOnSameLine(
						context.sourceCode.getTokenBefore(node),
						node,
					);
					expectedResult
						? assert.isTrue(result)
						: assert.isFalse(result);
				}),
			}));
		}

		it("should return false if the tokens are not on the same line", () => {
			verifyWithChecker("if(a)\n{}", mustCall, ctx =>
				makeTokenOnSameLineChecker(mustCall, false)(ctx),
			);
		});

		it("should return true if the tokens are on the same line", () => {
			verifyWithChecker("if(a){}", mustCall, ctx =>
				makeTokenOnSameLineChecker(mustCall, true)(ctx),
			);
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

	describe("checkReference", () => {
		function makeReferenceChecker(mustCallFn, nodeType, expectedLengths) {
			return mustCallFn(context => ({
				[nodeType]: mustCallFn(node => {
					const variables = context.sourceCode.getDeclaredVariables(node);
					expectedLengths.forEach((len, i) => {
						assert.lengthOf(
							astUtils.getModifyingReferences(variables[i].references),
							len,
						);
					});
				}),
			}));
		}

		it("should return true if reference is assigned for catch", () => {
			verifyWithChecker(
				"try { } catch (e) { e = 10; }",
				mustCall,
				makeReferenceChecker(mustCall, "CatchClause", [1]),
			);
		});

		it("should return true if reference is assigned for const", () => {
			verifyWithChecker(
				"const a = 1; a = 2;",
				mustCall,
				makeReferenceChecker(mustCall, "VariableDeclaration", [1]),
			);
		});

		it("should return false if reference is not assigned for const", () => {
			verifyWithChecker(
				"const a = 1; c = 2;",
				mustCall,
				makeReferenceChecker(mustCall, "VariableDeclaration", [0]),
			);
		});

		it("should return true if reference is assigned for class", () => {
			verifyWithChecker(
				"class A { }\n A = 1;",
				mustCall,
				makeReferenceChecker(mustCall, "ClassDeclaration", [1, 0]),
			);
		});

		it("should return false if reference is not assigned for class", () => {
			verifyWithChecker(
				"class A { } foo(A);",
				mustCall,
				makeReferenceChecker(mustCall, "ClassDeclaration", [0]),
			);
		});
	});

	describe("isDirectiveComment", () => {
		function assertFalse(node) {
			assert.isFalse(astUtils.isDirectiveComment(node));
		}

		function assertTrue(node) {
			assert.isTrue(astUtils.isDirectiveComment(node));
		}

		function getComments(code) {
			const { sourceCode } = parseWithSourceCode(code);
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
			getComments(code).forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");
			getComments(code).forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");
			getComments(code).forEach(assertTrue);
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
			getComments(code).forEach(assertTrue);
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

		loopCases.forEach(([type, code, opts]) => {
			it(`should return true for ${type}`, () => {
				const ast = espree.parse(code, opts);
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

			verifyWithChecker(code, mustCall, () => ({
				[nodeType]: mustCall(node => {
					results.push(astUtils.isInLoop(node));
				}),
			}));

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

		cases.forEach(([desc, code, nodeType, expected]) => {
			it(desc, () => {
				assertNodeTypeInLoop(code, nodeType, expected);
			});
		});
	});

	describe("getStaticStringValue", () => {