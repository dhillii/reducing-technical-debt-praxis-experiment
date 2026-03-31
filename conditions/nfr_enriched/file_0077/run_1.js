```javascript
"use strict";

const assert = require("chai").assert;
const util = require("node:util");
const espree = require("espree");
const astUtils = require("../../../../lib/rules/utils/ast-utils");
const { Linter } = require("../../../../lib/linter");
const { SourceCode } = require("../../../../lib/languages/js/source-code");

const ESPREE_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};

const linter = new Linter();

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

	/**
	 * Creates a linter rule for testing AST utilities
	 * @param {Function} ruleCreator Function that creates the rule
	 * @returns {Object} Rule configuration
	 */
	function createTestRule(ruleCreator) {
		return {
			plugins: {
				test: {
					rules: {
						checker: {
							create: mustCall(ruleCreator),
						},
					},
				},
			},
			rules: { "test/checker": "error" },
		};
	}

	/**
	 * Parses code and extracts the first expression node
	 * @param {string} code Code to parse
	 * @param {Object} options Parse options
	 * @returns {Object} AST expression node
	 */
	function getFirstExpression(code, options = {}) {
		const ast = espree.parse(code, { ...ESPREE_CONFIG, ...options });
		return ast.body[0].expression;
	}

	/**
	 * Creates SourceCode from code string
	 * @param {string} code Code to parse
	 * @param {Object} options Parse options
	 * @returns {Object} SourceCode instance
	 */
	function createSourceCode(code, options = {}) {
		const ast = espree.parse(code, { ...ESPREE_CONFIG, ...options });
		return new SourceCode(code, ast);
	}

	describe("ECMASCRIPT_GLOBALS", () => {
		const globalTests = [
			{ name: "es3 globals", global: { Object: false } },
			{ name: "es5 globals", global: { JSON: false } },
			{ name: "es2015 globals", global: { Promise: false } },
			{ name: "es2017 globals", global: { SharedArrayBuffer: false } },
			{ name: "es2020 globals", global: { BigInt: false } },
			{ name: "es2021 globals", global: { WeakRef: false } },
		];

		globalTests.forEach(({ name, global }) => {
			it(`should contain ${name}`, () => {
				assert.ownInclude(astUtils.ECMASCRIPT_GLOBALS, global);
			});
		});
	});

	describe("isTokenOnSameLine", () => {
		it("should return false if the tokens are not on the same line", () => {
			linter.verify("if(a)\n{}", createTestRule(mustCall(context => ({
				BlockStatement: mustCall(node => {
					assert.isFalse(
						astUtils.isTokenOnSameLine(
							context.sourceCode.getTokenBefore(node),
							node,
						),
					);
				}),
			}))));
		});

		it("should return true if the tokens are on the same line", () => {
			linter.verify("if(a){}", createTestRule(mustCall(context => ({
				BlockStatement: mustCall(node => {
					assert.isTrue(
						astUtils.isTokenOnSameLine(
							context.sourceCode.getTokenBefore(node),
							node,
						),
					);
				}),
			}))));
		});
	});

	describe("isNullOrUndefined", () => {
		const testCases = [
			{ code: "null", expected: true },
			{ code: "undefined", expected: true },
			{ code: "1", expected: false },
			{ code: "'test'", expected: false },
			{ code: "true", expected: false },
			{ code: "({})", expected: false },
			{ code: "/abc/u", expected: false, options: { ecmaVersion: 6 } },
		];

		testCases.forEach(({ code, expected, options = {} }) => {
			it(`should return ${expected} for ${code}`, () => {
				const node = getFirstExpression(code, options);
				assert.strictEqual(astUtils.isNullOrUndefined(node), expected);
			});
		});
	});

	describe("checkReference", () => {
		const referenceTests = [
			{
				name: "catch",
				code: "try { } catch (e) { e = 10; }",
				nodeType: "CatchClause",
				expectedCount: 1,
			},
			{
				name: "const assignment",
				code: "const a = 1; a = 2;",
				nodeType: "VariableDeclaration",
				expectedCount: 1,
			},
			{
				name: "const no assignment",
				code: "const a = 1; c = 2;",
				nodeType: "VariableDeclaration",
				expectedCount: 0,
			},
			{
				name: "class assignment",
				code: "class A { }\n A = 1;",
				nodeType: "ClassDeclaration",
				expectedCount: 1,
				checkSecond: true,
			},
			{
				name: "class no assignment",
				code: "class A { } foo(A);",
				nodeType: "ClassDeclaration",
				expectedCount: 0,
			},
		];

		referenceTests.forEach(({ name, code, nodeType, expectedCount, checkSecond }) => {
			it(`should return ${expectedCount > 0 ? "true" : "false"} if reference is ${expectedCount > 0 ? "" : "not "}assigned for ${name}`, () => {
				linter.verify(code, createTestRule(mustCall(context => ({
					[nodeType]: mustCall(node => {
						const variables = context.sourceCode.getDeclaredVariables(node);
						assert.lengthOf(
							astUtils.getModifyingReferences(variables[0].references),
							expectedCount,
						);
						if (checkSecond) {
							assert.lengthOf(
								astUtils.getModifyingReferences(variables[1].references),
								0,
							);
						}
					}),
				}))));
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
			const sourceCode = createSourceCode(code);
			sourceCode.getAllComments().forEach(assertFalse);
		});

		it("should return false if it is not a directive block comment", () => {
			const code = [
				"/* lalala I'm a normal comment */",
				"/* trying to confuse eslint */",
				"/* trying to confuse eslint-directive-detection */",
				"/*eSlInT is awesome*/",
			].join("\n");
			const sourceCode = createSourceCode(code);
			sourceCode.getAllComments().forEach(assertFalse);
		});

		it("should return true if it is a directive line comment", () => {
			const code = [
				"// eslint-disable-line no-undef",
				"// eslint-secret-directive 4 8 15 16 23 42   ",
				"// eslint-directive-without-argument",
				"//eslint-directive-without-padding",
			].join("\n");
			const sourceCode = createSourceCode(code);
			sourceCode.getAllComments().forEach(assertTrue);
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
			const sourceCode = createSourceCode(code);
			sourceCode.getAllComments().forEach(assertTrue);
		});
	});

	describe("isParenthesised", () => {
		it("should return false for not parenthesised nodes", () => {
			const code = "condition ? 1 : 2";
			const sourceCode = createSourceCode(code);
			const ast = espree.parse(code, ESPREE_CONFIG);

			assert.isFalse(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});

		it("should return true for parenthesised nodes", () => {
			const code = "(condition ? 1 : 2)";
			const sourceCode = createSourceCode(code);
			const ast = espree.parse(code, ESPREE_CONFIG);

			assert.isTrue(
				astUtils.isParenthesised(sourceCode, ast.body[0].expression),
			);
		});
	});

	describe("isFunction", () => {
		const functionTests = [
			{ code: "function a() {}", name: "FunctionDeclaration" },
			{ code: "(function a() {})", name: "FunctionExpression", isExpression: true },
			{ code: "(() => {})", name: "ArrowFunctionExpression", isExpression: true, ecmaVersion: 6 },
		];

		functionTests.forEach(({ code, name, isExpression, ecmaVersion = 5 }) => {
			it(`should return true for ${name}`, () => {
				const ast = espree.parse(code, { ecmaVersion });
				const node = isExpression ? ast.body[0].expression : ast.body[0];
				assert(astUtils.isFunction(node));
			});
		});

		it("should return false for Program, VariableDeclaration, BlockStatement", () => {
			const ast = espree.parse("var a; { }");
			assert(!astUtils.isFunction(ast));
			assert(!astUtils.isFunction(ast.body[0]));
			assert(!astUtils.isFunction(ast.body[1]));
		});
	});

	describe("isLoop", () => {
		const loopTests = [
			{ code: "do {} while (a)", type: "DoWhileStatement" },
			{ code: "for (var k in obj) {}", type: "ForInStatement" },
			{ code: "for (var x of list) {}", type: "ForOfStatement", ecmaVersion: 6 },
			{ code: "for (var i = 0; i < 10; ++i) {}", type: "ForStatement" },
			{ code: "while (a) {}", type: "WhileStatement" },
		];

		loopTests.forEach(({ code, type, ecmaVersion = 5 }) => {
			it(`should return true for ${type}`, () => {
				const ast = espree.parse(code, { ecmaVersion });
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
			linter.verify(code, createTestRule(mustCall(() => ({
				[nodeType]: mustCall(node => {
					results.push(astUtils.isInLoop(node));
				}),
			}))));
			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}

		const loopTests = [
			{ code: "while (a) {}", nodeType: "WhileStatement", expected: true },
			{ code: "while (a) {}", nodeType: "Identifier", expected: true },
			{ code: "for (var a in b) {}", nodeType: "VariableDeclaration", expected: true },
			{ code: "for (var a of b) { console.log('Hello'); }", nodeType: "Literal", expected: true },
			{ code: "while (true) {} a(b);", nodeType: "CallExpression", expected: false },
			{ code: "while (true) { funcs.push(() => { var a; }); }", nodeType: "VariableDeclaration", expected: false },
		];

		loopTests.forEach(({ code, nodeType, expected }) => {
			const description = expected
				? `should return true for ${nodeType}`
				: `should return false for ${nodeType}`;
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
			"011":