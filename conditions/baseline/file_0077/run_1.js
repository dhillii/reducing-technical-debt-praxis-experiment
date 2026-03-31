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
 * Creates a linter plugin with a single checker rule.
 * @param {Function} createFn The rule's create function
 * @returns {Object} Plugin config object
 */
function makeCheckerPlugin(createFn) {
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
 * @param {string} code Source code to parse
 * @param {Object} [options] Espree options
 * @returns {ASTNode} First expression node
 */
function parseExpression(code, options) {
	return espree.parse(code, options).body[0].expression;
}

/**
 * Creates a SourceCode instance from code string.
 * @param {string} code Source code
 * @param {Object} [options] Espree options
 * @returns {{ ast: Object, sourceCode: SourceCode }}
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
		/**
		 * Verifies isTokenOnSameLine result for a BlockStatement node.
		 * @param {string} code Source code
		 * @param {boolean} expected Expected result
		 */
		function verifyTokenOnSameLine(code, expected) {
			linter.verify(
				code,
				makeCheckerPlugin(
					mustCall(context => ({
						BlockStatement: mustCall(node => {
							const tokenBefore = context.sourceCode.getTokenBefore(node);
							assert[expected ? "isTrue" : "isFalse"](
								astUtils.isTokenOnSameLine(tokenBefore, node),
							);
						}),
					})),
				),
			);
		}

		it("should return false if the tokens are not on the same line", () => {
			verifyTokenOnSameLine("if(a)\n{}", false);
		});

		it("should return true if the tokens are on the same line", () => {
			verifyTokenOnSameLine("if(a){}", true);
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
		 * Verifies getModifyingReferences count for a given node type.
		 * @param {string} code Source code
		 * @param {string} nodeType AST node type to check
		 * @param {number[]} expectedLengths Expected lengths per variable
		 */
		function verifyModifyingReferences(code, nodeType, expectedLengths) {
			linter.verify(
				code,
				makeCheckerPlugin(
					mustCall(context => ({
						[nodeType]: mustCall(node => {
							const variables = context.sourceCode.getDeclaredVariables(node);
							expectedLengths.forEach((len, i) => {
								assert.lengthOf(
									astUtils.getModifyingReferences(variables[i].references),
									len,
								);
							});
						}),
					})),
				),
			);
		}

		it("should return true if reference is assigned for catch", () => {
			verifyModifyingReferences(
				"try { } catch (e) { e = 10; }",
				"CatchClause",
				[1],
			);
		});

		it("should return true if reference is assigned for const", () => {
			verifyModifyingReferences("const a = 1; a = 2;", "VariableDeclaration", [1]);
		});

		it("should return false if reference is not assigned for const", () => {
			verifyModifyingReferences("const a = 1; c = 2;", "VariableDeclaration", [0]);
		});

		it("should return true if reference is assigned for class", () => {
			verifyModifyingReferences("class A { }\n A = 1;", "ClassDeclaration", [1, 0]);
		});

		it("should return false if reference is not assigned for class", () => {
			verifyModifyingReferences("class A { } foo(A);", "ClassDeclaration", [0]);
		});
	});

	describe("isDirectiveComment", () => {
		/**
		 * Parses code and returns all comments with a SourceCode instance.
		 * @param {string} code Source code
		 * @returns {Array} Array of comment nodes
		 */
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

		it("should return true for parenthesised nodes", () => {
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
				makeCheckerPlugin(
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

	describe("getStaticStringValue", () => {
		const expectedResults = {
			"''": "",
			"'foo'": "foo",
			false: "false",
			true: "true",
			null: "null",
			0: "0",
			"0.": "0",
			".0": "0",
			1: "1",
			"1.": "1",
			".1": "0.1",
			12: "12",
			".12": "0.12",
			0.12: "0.12",
			12.34: "12.34",
			"12e3": "12000",
			"12e-3": "0.012",
			"12.34e5": "1234000",
			"12.34e-5": "0.0001234",
			"011": "9",
			"081": "81",
			"0b11": "3",
			"0b011": "3",
			"0o11": "9",
			"0o011": "9",
			"0x11": "17",
			"0x011": "17",
			"/a/": "/a/",
			"/a/i": "/a